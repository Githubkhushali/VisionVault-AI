require("dotenv").config();
const fs = require("fs");
const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const analyzeVideoFrameWithGemini = async (filePath, mimeType) => {
  const base64Image = fs.readFileSync(filePath).toString('base64');
  console.log('[Gemini] Analyzing video frame for all faces...');

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [
      { inlineData: { data: base64Image, mimeType } },
      'Analyze this video frame. It may have motion blur. Count ALL humans visible — faces, bodies, silhouettes, or partial figures. Be lenient: prefer detecting over missing.\n\n' +
      'Respond ONLY with JSON (no extra text):\n' +
      '{ "humanCount": number, "faces": [ { "confidence": number, "explanation": string, "faceSignature": string|null } ] }\n\n' +
      'If no humans detected: { "humanCount": 0, "faces": [] }'
    ],
    config: { responseMimeType: 'application/json' },
  });

  const raw = (response.text || '').trim();
  console.log('[Gemini Frame] Raw:', raw);

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const result = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    const humanCount = typeof result.humanCount === 'number' ? result.humanCount : (result.faces?.length || 0);
    const faces = Array.isArray(result.faces) ? result.faces : [];
    return { humanCount, faces };
  } catch (e) {
    console.error("JSON PARSE ERROR", e);
    return { humanCount: 0, faces: [] };
  }
};

// Create a dummy red square image
const dummyJpg = Buffer.from("ffd8ffe000104a46494600010101004800480000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffdb0043010909090c0b0c180d0d1832211c213232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232ffc00011080010001003012200021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102040403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9faffda000c03010002110311003f00f5e1f7cbfaf8f97a554a93863a3f5a0ffbd", "hex");
fs.writeFileSync("test.jpg", dummyJpg);

analyzeVideoFrameWithGemini("test.jpg", "image/jpeg").then(res => {
  console.log(res);
  process.exit(0);
}).catch(e => {
  console.error("UNHANDLED", e);
  process.exit(1);
});
