require("dotenv").config();
const { GoogleGenAI } = require("@google/genai");

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log("Using GEMINI_API_KEY:", apiKey ? `${apiKey.substring(0, 6)}... (length: ${apiKey.length})` : "undefined");

  if (!apiKey) {
    console.error("❌ GEMINI_API_KEY is not defined in .env!");
    process.exit(1);
  }

  try {
    console.log("Initializing GoogleGenAI client...");
    const ai = new GoogleGenAI({ apiKey: apiKey });

    console.log("Sending a generateContent request to 'gemini-2.5-flash'...");
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Hello, this is a test. Please respond with: 'API Key is working successfully!'",
    });

    console.log("\n✅ SUCCESS!");
    console.log("Response text:", response.text);
  } catch (error) {
    console.error("\n❌ FAILED!");
    console.error("Error details:", error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

testGemini();
