import { Router, Request, Response } from 'express';
import { ask, streamAsk, isOllamaReachable, listModels, HistoryMessage } from '../services/ollama';
import { askGemini, streamAskGemini } from '../services/gemini-assistant';
import { VALID_MODES, AssistantMode } from '../services/prompts';

const router = Router();

// ── Validation ────────────────────────────────────────────────────────────────

function validateBody(body: any): string | null {
  const { prompt, mode = 'chat', history = [], provider = 'ollama' } = body;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim())
    return '"prompt" is required and must be a non-empty string.';
  if (!VALID_MODES.includes(mode as AssistantMode))
    return `"mode" must be one of: ${VALID_MODES.join(', ')}.`;
  if (!Array.isArray(history))
    return '"history" must be an array.';
  if (!['ollama', 'gemini'].includes(provider))
    return '"provider" must be "ollama" or "gemini".';
  for (const msg of history) {
    if (!['user', 'assistant'].includes(msg.role) || typeof msg.content !== 'string')
      return 'Each history item must be { role: "user"|"assistant", content: string }.';
  }
  return null;
}

// GET /api/health
router.get('/health', async (_req: Request, res: Response) => {
  const reachable = await isOllamaReachable();
  const models    = reachable ? await listModels() : [];
  const geminiKey = !!process.env.GEMINI_API_KEY;
  res.json({ status: 'ok', ollama: reachable ? 'reachable' : 'unreachable', models, gemini: geminiKey });
});

// POST /api/assistant  (non-streaming — curl/testing)
router.post('/assistant', async (req: Request, res: Response) => {
  const err = validateBody(req.body);
  if (err) return res.status(400).json({ error: err });

  const { prompt, mode = 'chat', history = [], model, provider = 'ollama' } = req.body;

  try {
    if (provider === 'gemini') {
      const reply = await askGemini(mode as AssistantMode, prompt.trim(), history, model);
      return res.json({ reply, model: model ?? 'gemini-1.5-flash', mode, provider });
    }
    const result = await ask(mode as AssistantMode, prompt.trim(), history, model);
    return res.json({ ...result, provider });
  } catch (e: any) {
    const msg = e?.message ?? 'Unknown error';
    console.error('[POST /api/assistant]', msg);
    if (msg.includes('timed out')) return res.status(504).json({ error: msg });
    return res.status(502).json({ error: msg });
  }
});

// POST /api/assistant/stream  (SSE — used by web UI)
router.post('/assistant/stream', async (req: Request, res: Response) => {
  const err = validateBody(req.body);
  if (err) { res.status(400).json({ error: err }); return; }

  const { prompt, mode = 'chat', history = [], model, provider = 'ollama' } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // send headers immediately so browser opens the SSE connection

  const clientAbort = new AbortController();
  req.on('close', () => clientAbort.abort());

  const send = (payload: object) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

  try {
    // Quiz mode: collect full reply first so the client gets complete JSON
    if (mode === 'quiz') {
      let reply: string;
      if (provider === 'gemini') {
        reply = await askGemini(mode as AssistantMode, prompt.trim(), history, model);
      } else {
        const result = await ask(mode as AssistantMode, prompt.trim(), history, model);
        reply = result.reply;
      }
      send({ token: reply, done: true });
      res.end();
      return;
    }

    // All other modes: stream token by token
    const stream = provider === 'gemini'
      ? streamAskGemini(mode as AssistantMode, prompt.trim(), history, model)
      : streamAsk(mode as AssistantMode, prompt.trim(), history, model);

    for await (const token of stream) {
      if (clientAbort.signal.aborted) break;
      send({ token, done: false });
    }

    if (!clientAbort.signal.aborted) send({ token: '', done: true });
  } catch (e: any) {
    if (!clientAbort.signal.aborted) send({ error: e?.message ?? 'Stream failed' });
  } finally {
    res.end();
  }
});

export default router;
