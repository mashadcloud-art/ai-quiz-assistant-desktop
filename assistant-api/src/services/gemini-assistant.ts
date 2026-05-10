import { GoogleGenerativeAI, Content } from '@google/generative-ai';
import { AssistantMode, buildSystemPrompt } from './prompts';
import { HistoryMessage } from './ollama';

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set in .env');
  return new GoogleGenerativeAI(key);
}

// ─── Streaming ────────────────────────────────────────────────────────────────

export async function* streamAskGemini(
  mode: AssistantMode,
  userPrompt: string,
  history: HistoryMessage[] = [],
  modelName = 'gemini-1.5-flash',
): AsyncGenerator<string> {
  const client = getClient();

  const geminiModel = client.getGenerativeModel({
    model: modelName,
    systemInstruction: buildSystemPrompt(mode),
  });

  // Convert history: Gemini uses "model" instead of "assistant"
  const geminiHistory: Content[] = history.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  const chat   = geminiModel.startChat({ history: geminiHistory });
  const result = await chat.sendMessageStream(userPrompt);

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}

// ─── Non-streaming (quiz mode) ────────────────────────────────────────────────

export async function askGemini(
  mode: AssistantMode,
  userPrompt: string,
  history: HistoryMessage[] = [],
  modelName = 'gemini-1.5-flash',
): Promise<string> {
  const client = getClient();

  const geminiModel = client.getGenerativeModel({
    model: modelName,
    systemInstruction: buildSystemPrompt(mode),
  });

  const geminiHistory: Content[] = history.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  const chat   = geminiModel.startChat({ history: geminiHistory });
  const result = await chat.sendMessage(userPrompt);
  return result.response.text().trim();
}
