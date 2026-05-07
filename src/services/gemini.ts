// src/services/gemini.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not set in environment variables.");
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * Generates an answer from Gemini for the given quiz prompt.
 * @param prompt The quiz question or content you want answered.
 * @returns The generated text answer.
 */
export async function generateGeminiAnswer(prompt: string): Promise<string> {
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  return text.trim();
}

// Optional: expose a simple CLI for quick testing
if (require.main === module) {
  const [, , ...args] = process.argv;
  const prompt = args.join(" ");
  if (!prompt) {
    console.error("Usage: ts-node src/services/gemini.ts <prompt>");
    process.exit(1);
  }
  generateGeminiAnswer(prompt)
    .then((ans) => console.log("Gemini answer:\n", ans))
    .catch((err) => console.error("Error:", err));
}
