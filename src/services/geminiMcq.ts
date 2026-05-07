// src/services/geminiMcq.ts
import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not set in environment variables.");
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * Generates an answer for a multiple‑choice question, optionally with an attached image.
 * @param question The quiz question text.
 * @param options  Array of possible answer strings (e.g., ["A", "B", "C", "D"]).
 * @param imageBase64 Optional base64‑encoded image (data URL without the prefix).
 * @returns The chosen option (e.g., "A") as a string.
 */
export async function generateGeminiMcqAnswer(
  question: string,
  options: string[],
  imageBase64?: string
): Promise<string> {
  // Build the prompt describing the task clearly for the model.
  const prompt = `You are assisting a user taking a Coursera quiz. The question is:

${question}

The possible answer choices are:
${options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join("\n")}

Select the correct option letter (A, B, C, D, etc.) and respond with only that single letter.
`; 

  const parts: Part[] = [{ text: prompt }];
  if (imageBase64) {
    // Gemini expects a data URL. We attach PNG as an example; the caller should ensure correct MIME.
    const dataUrl = `data:image/png;base64,${imageBase64}`;
    parts.push({ inlineData: { mimeType: "image/png", data: imageBase64 } });
  }

  const result = await model.generateContent(parts);
  const response = await result.response;
  const text = response.text();
  // Extract first capital letter A‑Z from the response.
  const match = text.trim().match(/[A-Z]/);
  return match ? match[0] : "";
}

// Simple CLI for quick testing
if (require.main === module) {
  console.error(
    "Usage: ts-node src/services/geminiMcq.ts <question> <option1> <option2> ... [base64Image]"
  );
}
