import fetch from 'node-fetch';
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

// ─── Internal Ollama types ────────────────────────────────────────────────────

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatResponse {
  model: string;
  message: { role: string; content: string };
  done: boolean;
  total_duration?: number;
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function ask(
  mode: AssistantMode,
  userPrompt: string,
  history: HistoryMessage[] = [],
  modelOverride?: string,
): Promise<AssistantResponse> {
  const model = modelOverride ?? DEFAULT_MODEL;

  const messages: OllamaMessage[] = [
    { role: 'system', content: buildSystemPrompt(mode) },
    ...history,
    { role: 'user', content: userPrompt },
  ];

  // Prime quiz mode: starting the assistant turn with '[' keeps small models on track
  if (mode === 'quiz') {
    messages.push({ role: 'assistant', content: '[' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const startedAt = Date.now();

  let data: OllamaChatResponse;
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: mode === 'quiz' ? 0.2 : 0.7,
          num_predict: mode === 'summary' ? 1024 : 600,
        },
      }),
      signal: controller.signal as any,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama HTTP ${res.status}: ${text}`);
    }

    data = (await res.json()) as OllamaChatResponse;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${TIMEOUT_MS}ms. Try a shorter prompt or switch to phi3.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  let reply = data.message?.content?.trim() ?? '';

  // Re-attach the primed '[' if the model's response doesn't include it
  if (mode === 'quiz' && !reply.startsWith('[')) {
    reply = '[' + reply;
  }

  return {
    reply,
    model,
    mode,
    durationMs: Date.now() - startedAt,
  };
}

// ─── Health check ─────────────────────────────────────────────────────────────

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
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!res.ok) return [];
    const data = (await res.json()) as { models: { name: string }[] };
    return data.models.map(m => m.name);
  } catch {
    return [];
  }
}
