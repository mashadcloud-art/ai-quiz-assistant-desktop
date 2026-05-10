import { Router, Request, Response } from 'express';
import { ask, isOllamaReachable, listModels, HistoryMessage } from '../services/ollama';
import { VALID_MODES, AssistantMode } from '../services/prompts';

const router = Router();

// GET /api/health
router.get('/health', async (_req: Request, res: Response) => {
  const reachable = await isOllamaReachable();
  const models    = reachable ? await listModels() : [];
  res.json({ status: 'ok', ollama: reachable ? 'reachable' : 'unreachable', models });
});

// POST /api/assistant
router.post('/assistant', async (req: Request, res: Response) => {
  const { prompt, mode = 'chat', history = [], model } = req.body as {
    prompt?: string;
    mode?: string;
    history?: HistoryMessage[];
    model?: string;
  };

  // ── Validation ──────────────────────────────────────────────────────────────
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: '"prompt" is required and must be a non-empty string.' });
  }

  if (!VALID_MODES.includes(mode as AssistantMode)) {
    return res.status(400).json({
      error: `"mode" must be one of: ${VALID_MODES.join(', ')}. Got: "${mode}".`,
    });
  }

  if (!Array.isArray(history)) {
    return res.status(400).json({ error: '"history" must be an array.' });
  }

  for (const msg of history) {
    if (typeof msg.role !== 'string' || typeof msg.content !== 'string') {
      return res.status(400).json({
        error: 'Each history item must be { role: "user" | "assistant", content: string }.',
      });
    }
    if (!['user', 'assistant'].includes(msg.role)) {
      return res.status(400).json({ error: `Invalid history role: "${msg.role}".` });
    }
  }

  // ── Call Ollama ─────────────────────────────────────────────────────────────
  try {
    const result = await ask(mode as AssistantMode, prompt.trim(), history, model);
    return res.json(result);
  } catch (err: any) {
    const message: string = err?.message ?? 'Unknown error';
    console.error('[POST /api/assistant]', message);

    if (message.includes('timed out')) {
      return res.status(504).json({ error: message });
    }
    return res.status(502).json({ error: 'Could not reach Ollama. Is it running?' });
  }
});

export default router;
