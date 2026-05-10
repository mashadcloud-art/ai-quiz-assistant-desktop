import fetch from 'node-fetch';
import { Response as NodeFetchResponse } from 'node-fetch';
import { AssistantMode, buildSystemPrompt } from './prompts';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://129.159.235.164:11434';
const DEFAULT_MODEL   = process.env.OLLAMA_MODEL   ?? 'phi3:latest';
const TIMEOUT_MS      = parseInt(process.env.OLLAMA_TIMEOUT_MS ?? '60000', 10);

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantResponse {
  reply: string;
  model: string;
  mode: AssistantMode;
  durationMs?: number;
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChunk {
  message: { role: string; content: string };
  done: boolean;
}

function buildMessages(mode: AssistantMode, userPrompt: string, history: HistoryMessage[]): OllamaMessage[] {
  const messages: OllamaMessage[] = [
    { role: 'system', content: buildSystemPrompt(mode) },
    ...history,
    { role: 'user', content: userPrompt },
  ];
  if (mode === 'quiz') messages.push({ role: 'assistant', content: '[' });
  return messages;
}

// ─── Streaming (used by all modes except quiz) ────────────────────────────────

export async function* streamAsk(
  mode: AssistantMode,
  userPrompt: string,
  history: HistoryMessage[] = [],
  modelOverride?: string,
): AsyncGenerator<string> {
  const model    = modelOverride ?? DEFAULT_MODEL;
  const messages = buildMessages(mode, userPrompt, history);

  // Timeout only covers establishing the connection — NOT the streaming body.
  // Keeping the timeout active during streaming would abort the body read.
  const controller   = new AbortController();
  const connectTimer = setTimeout(() => controller.abort(), 15_000);

  let res: NodeFetchResponse;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, messages, stream: true,
        options: { temperature: 0.7, num_predict: 600 },
      }),
      signal: controller.signal as any,
    });
    clearTimeout(connectTimer); // connected — safe to stream indefinitely now
  } catch (err: any) {
    clearTimeout(connectTimer);
    if (err.name === 'AbortError') throw new Error('Ollama did not respond within 15s. Is it running?');
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama HTTP ${res.status}: ${text}`);
  }

  let buffer = '';
  for await (const rawChunk of res.body!) {
    buffer += rawChunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';       // keep any incomplete trailing line

    for (const line of lines) {
      if (!line.trim()) continue;
      let chunk: OllamaChunk;
      try { chunk = JSON.parse(line); } catch { continue; }
      if (chunk.message?.content) yield chunk.message.content;
      if (chunk.done) return;
    }
  }
}

// ─── Non-streaming (quiz mode — needs full JSON before client can parse it) ───

export async function ask(
  mode: AssistantMode,
  userPrompt: string,
  history: HistoryMessage[] = [],
  modelOverride?: string,
): Promise<AssistantResponse> {
  const model      = modelOverride ?? DEFAULT_MODEL;
  const messages   = buildMessages(mode, userPrompt, history);
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt  = Date.now();

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, messages, stream: false,
        options: { temperature: 0.2, num_predict: 1024 },
      }),
      signal: controller.signal as any,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama HTTP ${res.status}: ${text}`);
    }

    const data = (await res.json()) as { message: { content: string } };
    let reply  = data.message?.content?.trim() ?? '';
    if (mode === 'quiz' && !reply.startsWith('[')) reply = '[' + reply;

    return { reply, model, mode, durationMs: Date.now() - startedAt };
  } catch (err: any) {
    if (err.name === 'AbortError') throw new Error(`Request timed out after ${TIMEOUT_MS}ms.`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Health checks ────────────────────────────────────────────────────────────

export async function isOllamaReachable(): Promise<boolean> {
  try { return (await fetch(`${OLLAMA_BASE_URL}/api/tags`)).ok; }
  catch { return false; }
}

export async function listModels(): Promise<string[]> {
  try {
    const res  = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!res.ok) return [];
    const data = (await res.json()) as { models: { name: string }[] };
    return data.models.map(m => m.name);
  } catch { return []; }
}
