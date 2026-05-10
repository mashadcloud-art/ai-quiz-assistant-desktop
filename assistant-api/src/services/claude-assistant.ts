import Anthropic from '@anthropic-ai/sdk';
import { AssistantMode, buildSystemPrompt } from './prompts';
import { HistoryMessage } from './ollama';

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set in .env');
  return new Anthropic({ apiKey: key });
}

export async function* streamAskClaude(
  mode: AssistantMode,
  userPrompt: string,
  history: HistoryMessage[] = [],
  modelName = 'claude-haiku-4-5-20251001',
): AsyncGenerator<string> {
  const client = getClient();

  const messages = [
    ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: userPrompt },
  ];

  const stream = await client.messages.stream({
    model: modelName,
    max_tokens: mode === 'summary' ? 1024 : 600,
    system: buildSystemPrompt(mode),
    messages,
  });

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      yield event.delta.text;
    }
  }
}

export async function askClaude(
  mode: AssistantMode,
  userPrompt: string,
  history: HistoryMessage[] = [],
  modelName = 'claude-haiku-4-5-20251001',
): Promise<string> {
  const client = getClient();

  const messages = [
    ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: userPrompt },
  ];

  const res = await client.messages.create({
    model: modelName,
    max_tokens: 1024,
    system: buildSystemPrompt(mode),
    messages,
  });

  const block = res.content[0];
  return block.type === 'text' ? block.text.trim() : '';
}
