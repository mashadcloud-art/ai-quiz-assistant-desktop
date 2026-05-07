// src/server/api.ts
import { Router, Request, Response } from 'express';
import { generateGeminiAnswer } from '../services/gemini';

const router = Router();

// Health check (optional)
router.get('/ping', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

/**
 * POST /api/answer
 * Body: { quiz: string }
 * Returns: { answer: string }
 */
router.post('/answer', async (req: Request, res: Response) => {
  const { quiz } = req.body as { quiz?: string };
  if (!quiz) {
    return res.status(400).json({ error: 'Missing "quiz" in request body.' });
  }
  try {
    const answer = await generateGeminiAnswer(quiz);
    res.json({ answer });
  } catch (err) {
    console.error('Gemini answer error:', err);
    res.status(500).json({ error: 'Failed to generate answer.' });
  }
});

// MCQ endpoint
router.post('/answer-mcq', async (req: Request, res: Response) => {
  const { question, options, imageBase64 } = req.body as {
    question?: string;
    options?: string[];
    imageBase64?: string;
  };
  if (!question || !options || !Array.isArray(options) || options.length === 0) {
    return res.status(400).json({ error: 'Missing "question" or "options" in request body.' });
  }
  try {
    const answer = await import('../services/geminiMcq').then(m => m.generateGeminiMcqAnswer(question, options, imageBase64));
    res.json({ answer });
  } catch (err) {
    console.error('Gemini MCQ answer error:', err);
    res.status(500).json({ error: 'Failed to generate MCQ answer.' });
  }
});

export default router;
