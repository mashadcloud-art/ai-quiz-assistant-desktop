import { Router, Request, Response } from 'express';
import fetch from 'node-fetch';
import { isOllamaReachable, listModels, HistoryMessage } from '../services/ollama';
import { VALID_MODES, AssistantMode } from '../services/prompts';
import {
  VALID_PROVIDERS,
  PROVIDER_REGISTRY,
  getAvailableProviders,
  streamProvider,
  askProvider,
} from '../services/providers';

const router = Router();

// ── Validation ────────────────────────────────────────────────────────────────

function validateBody(body: any): string | null {
  const { prompt, mode = 'chat', history = [], provider = 'groq' } = body;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim())
    return '"prompt" is required.';
  if (!VALID_MODES.includes(mode as AssistantMode))
    return `"mode" must be one of: ${VALID_MODES.join(', ')}.`;
  if (!Array.isArray(history))
    return '"history" must be an array.';
  if (!VALID_PROVIDERS.includes(provider))
    return `"provider" must be one of: ${VALID_PROVIDERS.join(', ')}.`;
  for (const msg of history) {
    if (!['user', 'assistant'].includes(msg.role) || typeof msg.content !== 'string')
      return 'Each history item must be { role: "user"|"assistant", content: string }.';
  }
  return null;
}

// GET /api/health
router.get('/health', async (_req: Request, res: Response) => {
  const ollamaUp = await isOllamaReachable();
  const models   = ollamaUp ? await listModels() : [];
  res.json({
    status:    'ok',
    ollama:    ollamaUp ? 'reachable' : 'unreachable',
    models,
    providers: getAvailableProviders(),
  });
});

// GET /api/status  — provider configuration + credit info
router.get('/status', async (_req: Request, res: Response) => {
  const FREE_NOTES: Record<string, string> = {
    groq:       '14,400 req/day · 6,000 tok/min (free)',
    gemini:     '1,500 req/day · 1M tok/min (free)',
    openrouter: 'Free models available',
    cerebras:   'Free tier — fast inference',
    sambanova:  'Free tier credits',
    ollama:     'Unlimited (self-hosted)',
    claude:     'Paid — see console.anthropic.com',
    grok:       'Paid — see console.x.ai',
    deepinfra:  'Pay-per-token — deepinfra.com',
  };

  const providers: Record<string, any> = {};

  for (const [id, meta] of Object.entries(PROVIDER_REGISTRY)) {
    const configured = !meta.envKey || !!process.env[meta.envKey];
    providers[id] = {
      label:      meta.label,
      configured,
      models:     meta.models,
      freeNote:   FREE_NOTES[id] ?? '',
    };
  }

  // OpenRouter: fetch live credit/usage info
  if (providers.openrouter?.configured) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
      });
      if (r.ok) {
        const body: any = await r.json();
        const d = body?.data ?? {};
        providers.openrouter.usage     = d.usage;        // USD spent
        providers.openrouter.limit     = d.limit;        // null = unlimited
        providers.openrouter.isFree    = d.is_free_tier;
        providers.openrouter.rateLimit = d.rate_limit;   // { requests, interval }
      }
    } catch { /* network error — skip */ }
  }

  res.json({ providers });
});

// POST /api/assistant  (non-streaming — curl/testing)
router.post('/assistant', async (req: Request, res: Response) => {
  const err = validateBody(req.body);
  if (err) return res.status(400).json({ error: err });

  const { prompt, mode = 'chat', history = [], model, provider = 'groq' } = req.body;
  try {
    const reply = await askProvider(provider, mode as AssistantMode, prompt.trim(), history, model);
    return res.json({ reply, provider, mode });
  } catch (e: any) {
    const msg = e?.message ?? 'Unknown error';
    console.error(`[POST /api/assistant] [${provider}]`, msg);
    if (msg.includes('timed out')) return res.status(504).json({ error: msg });
    return res.status(502).json({ error: msg });
  }
});

// POST /api/assistant/stream  (SSE — used by web UI)
router.post('/assistant/stream', async (req: Request, res: Response) => {
  const err = validateBody(req.body);
  if (err) { res.status(400).json({ error: err }); return; }

  const { prompt, mode = 'chat', history = [], model, provider = 'groq' } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (payload: object) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  let clientGone = false;
  // Delay registering the close handler so flushHeaders() doesn't trigger it
  res.flushHeaders();
  setImmediate(() => {
    req.on('close', () => { clientGone = true; });
  });

  try {
    // Quiz mode: collect full reply first so client gets complete JSON
    if (mode === 'quiz') {
      const reply = await askProvider(provider, mode as AssistantMode, prompt.trim(), history, model);
      send({ token: reply, done: true });
      res.end();
      return;
    }

    const stream = streamProvider(provider, mode as AssistantMode, prompt.trim(), history, model);

    for await (const token of stream) {
      if (clientGone) break;
      send({ token, done: false });
    }

    send({ token: '', done: true });
  } catch (e: any) {
    console.error(`[/api/assistant/stream] [${provider}]`, e?.message);
    send({ error: e?.message ?? 'Stream failed' });
  } finally {
    res.end();
  }
});

export default router;
