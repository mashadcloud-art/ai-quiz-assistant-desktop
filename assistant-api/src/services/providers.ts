// Single place that defines every provider and dispatches streaming/non-streaming calls.
import { AssistantMode } from './prompts';
import { HistoryMessage, streamAsk, ask }                           from './ollama';
import { streamAskGemini, askGemini }                               from './gemini-assistant';
import { streamAskClaude, askClaude }                               from './claude-assistant';
import { streamAskOpenAICompatible, askOpenAICompatible }           from './openai-compatible';

// ─── Provider registry (shown in the UI) ─────────────────────────────────────

export interface ProviderMeta {
  label: string;
  models: string[];
  envKey: string;       // which env var must be set (empty = always available)
}

export const PROVIDER_REGISTRY: Record<string, ProviderMeta> = {
  groq: {
    label:  '⚡ Groq (fastest)',
    models: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
    envKey: 'GROQ_API_KEY',
  },
  gemini: {
    label:  '🔷 Gemini (free)',
    models: ['gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro'],
    envKey: 'GEMINI_API_KEY',
  },
  claude: {
    label:  '🧠 Claude',
    models: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'],
    envKey: 'ANTHROPIC_API_KEY',
  },
  grok: {
    label:  '🐦 Grok (xAI)',
    models: ['grok-beta', 'grok-2'],
    envKey: 'XAI_API_KEY',
  },
  deepinfra: {
    label:  '🔩 DeepInfra',
    models: ['meta-llama/Meta-Llama-3.1-8B-Instruct', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
    envKey: 'DEEPINFRA_API_KEY',
  },
  ollama: {
    label:  '🦙 Ollama (private)',
    models: ['phi3:latest', 'llama3:latest'],
    envKey: '',
  },
};

export const VALID_PROVIDERS = Object.keys(PROVIDER_REGISTRY);

// Returns only providers that have their key configured
export function getAvailableProviders(): Record<string, ProviderMeta> {
  const result: Record<string, ProviderMeta> = {};
  for (const [id, meta] of Object.entries(PROVIDER_REGISTRY)) {
    if (!meta.envKey || process.env[meta.envKey]) {
      result[id] = meta;
    }
  }
  return result;
}

// ─── Unified streaming dispatcher ────────────────────────────────────────────

export function streamProvider(
  provider: string,
  mode: AssistantMode,
  prompt: string,
  history: HistoryMessage[],
  model?: string,
): AsyncGenerator<string> {
  switch (provider) {
    case 'ollama':    return streamAsk(mode, prompt, history, model);
    case 'gemini':    return streamAskGemini(mode, prompt, history, model);
    case 'claude':    return streamAskClaude(mode, prompt, history, model);
    case 'groq':
    case 'grok':
    case 'deepinfra': return streamAskOpenAICompatible(provider, mode, prompt, history, model);
    default:          throw new Error(`Unknown provider: "${provider}"`);
  }
}

// ─── Unified non-streaming dispatcher ────────────────────────────────────────

export async function askProvider(
  provider: string,
  mode: AssistantMode,
  prompt: string,
  history: HistoryMessage[],
  model?: string,
): Promise<string> {
  switch (provider) {
    case 'ollama': {
      const r = await ask(mode, prompt, history, model);
      return r.reply;
    }
    case 'gemini':    return askGemini(mode, prompt, history, model);
    case 'claude':    return askClaude(mode, prompt, history, model);
    case 'groq':
    case 'grok':
    case 'deepinfra': return askOpenAICompatible(provider, mode, prompt, history, model);
    default:          throw new Error(`Unknown provider: "${provider}"`);
  }
}
