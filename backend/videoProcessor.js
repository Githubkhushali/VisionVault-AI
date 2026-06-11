const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);

const path = require('path');
const fs = require('fs');

/**
 * Extracts frames from a video file at a set interval.
 *
 * FIX: The fluent-ffmpeg `filenames` event ONLY fires when using the
 * `.screenshots()` API. When using `.fps()` + `.output()`, `filenames`
 * never fires so extractedFrames was always [].
 *
 * Fix: Read the outputDir after the `end` event fires to collect the
 * actual saved frame files from disk.
 *
 * @param {string} videoPath - Path to the uploaded video file
 * @param {string} outputDir - Directory where extracted frames are saved temporarily
 * @param {number} [framesPerSecond=0.5] - How many frames to extract per second (0.5 = 1 every 2s)
 * @returns {Promise<string[]>} - Array of absolute file paths to extracted JPEG frames
 */
const extractFramesFromVideo = (videoPath, outputDir, framesPerSecond = 1) => {
    return new Promise((resolve, reject) => {
        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        ffmpeg(videoPath)
            // Use output video filter to set extraction rate.
            // fps=0.5 → 1 frame every 2 seconds (good balance for most videos).
            // Increase to fps=1 for denser sampling (more Gemini calls, more cost).
            .outputOptions(['-vf', `fps=${framesPerSecond}`])
            .output(path.join(outputDir, 'frame-%04d.jpg'))
            .on('end', () => {
                // ── KEY FIX ──────────────────────────────────────────────────
                // Do NOT rely on the `filenames` event — it never fires with
                // this API pattern. Instead, read the directory after ffmpeg
                // finishes to collect every saved .jpg file.
                try {
                    const frames = fs.readdirSync(outputDir)
                        .filter(f => f.endsWith('.jpg'))
                        .sort() // ensure chronological order (frame-0001 < frame-0002 …)
                        .map(f => path.join(outputDir, f));

                    console.log(`[videoProcessor] Frame extraction complete. Total frames: ${frames.length}`);
                    resolve(frames);
                } catch (readErr) {
                    console.error('[videoProcessor] Error reading frames directory:', readErr.message);
                    reject(readErr);
                }
            })
            .on('error', (err) => {
                console.error('[videoProcessor] ffmpeg error during frame extraction:', err.message);
                reject(err);
            })
            .run();
    });
};

module.exports = { extractFramesFromVideo };