import { GoogleGenerativeAI, Content } from '@google/generative-ai';
import { AssistantMode, buildSystemPrompt } from './prompts';
import { HistoryMessage } from './ollama';

function getModel(modelName: string, systemPrompt: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set in .env');
  const client = new GoogleGenerativeAI(key);
  return client.getGenerativeModel(
    { model: modelName, systemInstruction: systemPrompt },
    { apiVersion: 'v1beta' },
  );
}

function toGeminiHistory(history: HistoryMessage[]): Content[] {
  return history.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));
}

export async function* streamAskGemini(
  mode: AssistantMode,
  userPrompt: string,
  history: HistoryMessage[] = [],
  modelName = 'gemini-1.5-flash',
): AsyncGenerator<string> {
  const geminiModel = getModel(modelName, buildSystemPrompt(mode));
  const chat   = geminiModel.startChat({ history: toGeminiHistory(history) });
  const result = await chat.sendMessageStream(userPrompt);
  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}

export async function askGemini(
  mode: AssistantMode,
  userPrompt: string,
  history: HistoryMessage[] = [],
  modelName = 'gemini-1.5-flash',
): Promise<string> {
  const geminiModel = getModel(modelName, buildSystemPrompt(mode));
  const chat   = geminiModel.startChat({ history: toGeminiHistory(history) });
  const result = await chat.sendMessage(userPrompt);
  return result.response.text().trim();
}
