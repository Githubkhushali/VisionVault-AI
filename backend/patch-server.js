const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'server.js');
let code = fs.readFileSync(targetFile, 'utf8');

// 1. Replace analyzeVideoFrameWithGemini
const helperStart = '// ── Helper: lenient multi-face frame analysis for video ───────';
const helperEnd = '};\n\n// ── Route: Health Check ───────────────────────────────────────';
const helperCode = `// ── Helper: lenient multi-face frame analysis for video (BATCHED) ───────
// Video frames can be motion-blurred or partially cropped.
// Returns ALL unique faces found across the batch of frames as an array.
const analyzeVideoFramesBatchWithGemini = async (framePaths, mimeType) => {
  console.log(\`[Gemini] Analyzing video frame batch (\${framePaths.length} frames) for unique faces...\`);

  const contents = [
    'Analyze these video frames. They belong to the same video sequence. Extract ALL unique humans visible across the entire sequence. Be lenient: prefer detecting over missing.\\n\\n' +
    'Respond ONLY with JSON (no extra text):\\n' +
    '{ "uniqueFaces": [ { "confidence": number, "explanation": string, "faceSignature": string|null, "bestFrameIndex": number (0 to ' + (framePaths.length - 1) + ') } ] }\\n\\n' +
    'If no humans detected: { "uniqueFaces": [] }'
  ];

  for (let i = 0; i < framePaths.length; i++) {
    const base64Image = fs.readFileSync(framePaths[i]).toString('base64');
    contents.push({ inlineData: { data: base64Image, mimeType } });
  }

  const response = await withRetry(() => ai.models.generateContent({
    model: 'gemini-1.5-flash',
    contents: contents,
    config: { responseMimeType: 'application/json' },
  }));

  const raw = (response.text || '').trim();
  console.log('[Gemini Batch] Raw:', raw.slice(0, 250));

  try {
    const jsonMatch = raw.match(/\\{[\\s\\S]*\\}/);
    const result = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    const faces = Array.isArray(result.uniqueFaces) ? result.uniqueFaces : [];
    
    // Ensure bestFrameIndex is valid
    faces.forEach(f => {
      if (typeof f.bestFrameIndex !== 'number' || f.bestFrameIndex < 0 || f.bestFrameIndex >= framePaths.length) {
        f.bestFrameIndex = 0;
      }
    });
    return { faces };
  } catch {
    console.warn('[Gemini Batch] JSON parse failed, returning empty faces.');
    return { faces: [] };
  }
};\n\n// ── Route: Health Check ───────────────────────────────────────`;

const helperStartIndex = code.indexOf(helperStart);
const helperEndIndex = code.indexOf(helperEnd) + helperEnd.length - ('\n\n// ── Route: Health Check ───────────────────────────────────────').length;
if (helperStartIndex !== -1 && code.indexOf(helperEnd) !== -1) {
  code = code.substring(0, helperStartIndex) + helperCode + code.substring(helperEndIndex);
} else {
  console.error("Helper bounds not found.");
  process.exit(1);
}

// 2. Replace loop inside upload-video
const loopStart = '    // 2. Loop through frames sequentially';
const loopEnd = '    // 3. Clean up session-cached face frames (kept alive for dedup)';
const loopCode = `    // 2. Batch frames into chunks of 10
    const BATCH_SIZE = 10;
    const frameMimeType = "image/jpeg";
    let batchIdx = 0;

    for (let i = 0; i < frames.length; i += BATCH_SIZE) {
      const frameBatch = frames.slice(i, i + BATCH_SIZE);
      batchIdx++;
      
      console.log(\`[Video Analysis] Processing batch \${batchIdx} (\${frameBatch.length} frames)\`);

      try {
        if (batchIdx > 1) await sleep(4200);

        const { faces } = await analyzeVideoFramesBatchWithGemini(frameBatch, frameMimeType);

        if (faces.length === 0) {
          frameBatch.forEach(fp => deleteTempFile(fp));
          continue;
        }

        videoAnalysisSummary.humansDetectedCount += faces.length;
        console.log(\`[Video Analysis] Batch \${batchIdx}: \${faces.length} unique face(s) detected.\`);

        // Process each unique face found in this batch
        for (let fi = 0; fi < faces.length; fi++) {
          const face = faces[fi];
          const faceIndex = fi + 1;
          const framePath = frameBatch[face.bestFrameIndex];

          if (fi > 0) await sleep(4200);

          let matchedFace = false;
          let matchedId   = null;

          // ── Step 1: Session cache check (image-to-image) ────────
          for (const cached of sessionFaceCache) {
            const { matched, confidence } = await matchFrameAgainstReference(
              framePath, frameMimeType,
              cached.imagePath, cached.mimeType
            );
            if (matched) {
              console.log(\`[Video] Batch \${batchIdx} face #\${faceIndex} → session match (ID: \${cached.id}, conf: \${confidence}%)\`);
              matchedFace = true;
              matchedId   = cached.id;
              break;
            }
          }

          // ── Step 2: DB text-signature match ─────────────────────
          if (!matchedFace) {
            const sessionIds   = new Set(sessionFaceCache.map(f => f.id));
            const dbFaces = (await db.all("SELECT id, face_signature, s3_url FROM detected_faces"))
              .filter(f => !sessionIds.has(f.id));

            if (dbFaces.length > 0) {
              const matchResult = await matchFaceBySignature(
                framePath, frameMimeType, dbFaces,
                face.faceSignature, faceIndex, faces.length
              );
              matchedFace = matchResult.matched;
              matchedId   = matchResult.matchedId;
              if (matchedFace) console.log(\`[Video] Batch \${batchIdx} face #\${faceIndex} → DB match (ID: \${matchedId})\`);
            }
          }

          // ── Step 3: Act ─────────────────────────────────────────
          if (matchedFace && matchedId) {
            // Recurring — bump counter
            await db.run(
              \`UPDATE detected_faces SET upload_count = upload_count + 1, last_seen = CURRENT_TIMESTAMP WHERE id = ?\`,
              [matchedId]
            );
            if (!videoAnalysisSummary.facesRecognized.includes(matchedId)) {
              videoAnalysisSummary.facesRecognized.push(matchedId);
            }
          } else {
            // New unique face — upload this frame as snapshot to S3
            console.log(\`[Video] Batch \${batchIdx} face #\${faceIndex} → new. Uploading snapshot to S3...\`);
            const frameFileName = path.basename(framePath);
            const s3Url = await uploadToS3(framePath, frameFileName, frameMimeType);

            const faceId = \`face_\${Date.now()}_\${Math.random().toString(36).substr(2, 4)}\`;
            const finalSignature = face.faceSignature || face.explanation || \`Video face\`;

            await db.run(
              \`INSERT INTO detected_faces (id, face_signature, upload_count, s3_url) VALUES (?, ?, 1, ?)\`,
              [faceId, finalSignature, s3Url]
            );

            // Keep the new face's frame alive for within-video dedup
            const isAlreadyInCache = sessionFaceCache.some(c => c.imagePath === framePath);
            if (!isAlreadyInCache) {
              sessionFaceCache.push({ id: faceId, imagePath: framePath, mimeType: frameMimeType, s3Url });
            }

            videoAnalysisSummary.facesRegistered.push(faceId);
            videoAnalysisSummary.faceSnapshots.push({ id: faceId, s3Url });
          }
        }

      } catch (batchError) {
        console.error(\`[Video Analysis] Error on batch \${batchIdx}:\`, batchError.message);
      } finally {
        // Clean up frames in this batch that weren't added to session cache
        for (const fp of frameBatch) {
          const inCache = sessionFaceCache.some(c => c.imagePath === fp);
          if (!inCache) {
            deleteTempFile(fp);
          }
        }
      }
    }\n\n    // 3. Clean up session-cached face frames (kept alive for dedup)`;

const loopStartIndex = code.indexOf(loopStart);
const loopEndIndex = code.indexOf(loopEnd) + loopEnd.length - ('    // 3. Clean up session-cached face frames (kept alive for dedup)').length;
if (loopStartIndex !== -1 && code.indexOf(loopEnd) !== -1) {
  code = code.substring(0, loopStartIndex) + loopCode + code.substring(loopEndIndex);
} else {
  console.error("Loop bounds not found.");
  process.exit(1);
}

fs.writeFileSync(targetFile, code);
console.log("Successfully patched server.js");
