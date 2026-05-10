import { Router, Request, Response } from 'express';
import { ask, streamAsk, isOllamaReachable, listModels, HistoryMessage } from '../services/ollama';
import { VALID_MODES, AssistantMode } from '../services/prompts';

const router = Router();

// ── Shared validation ─────────────────────────────────────────────────────────

function validateBody(body: any): string | null {
  const { prompt, mode = 'chat', history = [] } = body;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim())
    return '"prompt" is required and must be a non-empty string.';
  if (!VALID_MODES.includes(mode as AssistantMode))
    return `"mode" must be one of: ${VALID_MODES.join(', ')}. Got: "${mode}".`;
  if (!Array.isArray(history))
    return '"history" must be an array.';
  for (const msg of history) {
    if (typeof msg.role !== 'string' || typeof msg.content !== 'string')
      return 'Each history item must be { role: "user"|"assistant", content: string }.';
    if (!['user', 'assistant'].includes(msg.role))
      return `Invalid history role: "${msg.role}".`;
  }
  return null;
}

// GET /api/health
router.get('/health', async (_req: Request, res: Response) => {
  const reachable = await isOllamaReachable();
  const models    = reachable ? await listModels() : [];
  res.json({ status: 'ok', ollama: reachable ? 'reachable' : 'unreachable', models });
});

// POST /api/assistant  (non-streaming — used for quiz mode + curl testing)
router.post('/assistant', async (req: Request, res: Response) => {
  const err = validateBody(req.body);
  if (err) return res.status(400).json({ error: err });

  const { prompt, mode = 'chat', history = [], model } = req.body;

  try {
    const result = await ask(mode as AssistantMode, prompt.trim(), history, model);
    return res.json(result);
  } catch (e: any) {
    const msg: string = e?.message ?? 'Unknown error';
    console.error('[POST /api/assistant]', msg);
    if (msg.includes('timed out')) return res.status(504).json({ error: msg });
    return res.status(502).json({ error: 'Could not reach Ollama. Is it running?' });
  }
});

// POST /api/assistant/stream  (Server-Sent Events — used by the web UI)
router.post('/assistant/stream', async (req: Request, res: Response) => {
  const err = validateBody(req.body);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }

  const { prompt, mode = 'chat', history = [], model } = req.body;

  // Quiz mode: collect full reply first so the frontend gets valid JSON in one shot
  if (mode === 'quiz') {
    try {
      const result = await ask(mode as AssistantMode, prompt.trim(), history, model);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(`data: ${JSON.stringify({ token: result.reply, done: true })}\n\n`);
      res.end();
    } catch (e: any) {
      res.status(502).json({ error: 'Could not reach Ollama.' });
    }
    return;
  }

  // All other modes: stream tokens as SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const clientAbort = new AbortController();
  req.on('close', () => clientAbort.abort());

  try {
    for await (const token of streamAsk(mode as AssistantMode, prompt.trim(), history, model)) {
      if (clientAbort.signal.aborted) break;
      res.write(`data: ${JSON.stringify({ token, done: false })}\n\n`);
    }
    if (!clientAbort.signal.aborted) {
      res.write(`data: ${JSON.stringify({ token: '', done: true })}\n\n`);
    }
  } catch (e: any) {
    if (!clientAbort.signal.aborted) {
      res.write(`data: ${JSON.stringify({ error: e?.message ?? 'Stream failed' })}\n\n`);
    }
  } finally {
    res.end();
  }
});

export default router;
