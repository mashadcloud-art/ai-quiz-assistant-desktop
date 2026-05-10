// Handles all OpenAI-compatible providers: Groq, xAI (Grok), DeepInfra
import OpenAI from 'openai';
import { AssistantMode, buildSystemPrompt } from './prompts';
import { HistoryMessage } from './ollama';

interface ProviderConfig {
  apiKey: string;
  baseURL: string;
  defaultModel: string;
}

const CONFIGS: Record<string, () => ProviderConfig> = {
  groq: () => ({
    apiKey:       process.env.GROQ_API_KEY ?? '',
    baseURL:      'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.1-8b-instant',
  }),
  grok: () => ({
    apiKey:       process.env.XAI_API_KEY ?? '',
    baseURL:      'https://api.x.ai/v1',
    defaultModel: 'grok-beta',
  }),
  deepinfra: () => ({
    apiKey:       process.env.DEEPINFRA_API_KEY ?? '',
    baseURL:      'https://api.deepinfra.com/v1/openai',
    defaultModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
  }),
};

function getClient(provider: string): { client: OpenAI; config: ProviderConfig } {
  const configFn = CONFIGS[provider];
  if (!configFn) throw new Error(`Unknown OpenAI-compatible provider: ${provider}`);
  const config = configFn();
  if (!config.apiKey) throw new Error(`API key for "${provider}" is not set in .env`);
  return { client: new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL }), config };
}

function buildMessages(mode: AssistantMode, userPrompt: string, history: HistoryMessage[]) {
  return [
    { role: 'system' as const, content: buildSystemPrompt(mode) },
    ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: userPrompt },
  ];
}

export async function* streamAskOpenAICompatible(
  provider: string,
  mode: AssistantMode,
  userPrompt: string,
  history: HistoryMessage[] = [],
  modelOverride?: string,
): AsyncGenerator<string> {
  const { client, config } = getClient(provider);
  const model    = modelOverride ?? config.defaultModel;
  const messages = buildMessages(mode, userPrompt, history);

  const stream = await client.chat.completions.create({
    model,
    messages,
    stream: true,
    temperature: mode === 'quiz' ? 0.2 : 0.7,
    max_tokens: mode === 'summary' ? 1024 : 600,
  });

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content;
    if (token) yield token;
  }
}

export async function askOpenAICompatible(
  provider: string,
  mode: AssistantMode,
  userPrompt: string,
  history: HistoryMessage[] = [],
  modelOverride?: string,
): Promise<string> {
  const { client, config } = getClient(provider);
  const model    = modelOverride ?? config.defaultModel;
  const messages = buildMessages(mode, userPrompt, history);

  const res = await client.chat.completions.create({
    model,
    messages,
    stream: false,
    temperature: mode === 'quiz' ? 0.2 : 0.7,
    max_tokens: 1024,
  });

  return res.choices[0]?.message?.content?.trim() ?? '';
}
