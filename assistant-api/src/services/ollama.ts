import fetch from 'node-fetch';
import { Response as NodeFetchResponse } from 'node-fetch';
import { AssistantMode, buildSystemPrompt } from './prompts';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://129.159.235.164:11434';
const DEFAULT_MODEL   = process.env.OLLAMA_MODEL   ?? 'phi3:latest';
const TIMEOUT_MS      = parseInt(process.env.OLLAMA_TIMEOUT_MS ?? '60000', 10);

// ─── Public types ─────────────────────────────────────────────────────────────

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

// ─── Internal types ───────────────────────────────────────────────────────────

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChunk {
  message: { role: string; content: string };
  done: boolean;
}

// ─── Shared message builder ───────────────────────────────────────────────────

function buildMessages(mode: AssistantMode, userPrompt: string, history: HistoryMessage[]): OllamaMessage[] {
  const messages: OllamaMessage[] = [
    { role: 'system', content: buildSystemPrompt(mode) },
    ...history,
    { role: 'user', content: userPrompt },
  ];
  if (mode === 'quiz') {
    messages.push({ role: 'assistant', content: '[' });
  }
  return messages;
}

function buildBody(mode: AssistantMode, messages: OllamaMessage[], model: string, stream: boolean) {
  return JSON.stringify({
    model,
    messages,
    stream,
    options: {
      temperature: mode === 'quiz' ? 0.2 : 0.7,
      num_predict: mode === 'summary' ? 1024 : 600,
    },
  });
}

// ─── Streaming ask (yields text chunks) ──────────────────────────────────────

export async function* streamAsk(
  mode: AssistantMode,
  userPrompt: string,
  history: HistoryMessage[] = [],
  modelOverride?: string,
): AsyncGenerator<string> {
  const model    = modelOverride ?? DEFAULT_MODEL;
  const messages = buildMessages(mode, userPrompt, history);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: NodeFetchResponse;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildBody(mode, messages, model, true),
      signal: controller.signal as any,
    });
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error(`Request timed out after ${TIMEOUT_MS}ms.`);
    throw err;
  }

  if (!res.ok) {
    clearTimeout(timer);
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama HTTP ${res.status}: ${text}`);
  }

  try {
    for await (const rawChunk of res.body!) {
      const lines = rawChunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        let chunk: OllamaChunk;
        try { chunk = JSON.parse(line); } catch { continue; }
        if (chunk.message?.content) yield chunk.message.content;
        if (chunk.done) return;
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

// ─── Non-streaming ask (for quiz mode — needs full JSON before parsing) ───────

export async function ask(
  mode: AssistantMode,
  userPrompt: string,
  history: HistoryMessage[] = [],
  modelOverride?: string,
): Promise<AssistantResponse> {
  const model    = modelOverride ?? DEFAULT_MODEL;
  const messages = buildMessages(mode, userPrompt, history);

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt  = Date.now();

  let reply = '';
  try {
    // For quiz, collect full stream so we can assemble valid JSON
    const gen = streamAsk(mode, userPrompt, history, model);
    for await (const chunk of gen) { reply += chunk; }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${TIMEOUT_MS}ms.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  reply = reply.trim();
  if (mode === 'quiz' && !reply.startsWith('[')) reply = '[' + reply;

  return { reply, model, mode, durationMs: Date.now() - startedAt };
}

// ─── Health checks ────────────────────────────────────────────────────────────

export async function isOllamaReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function listModels(): Promise<string[]> {
  try {
    const res  = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!res.ok) return [];
    const data = (await res.json()) as { models: { name: string }[] };
    return data.models.map(m => m.name);
  } catch {
    return [];
  }
}
