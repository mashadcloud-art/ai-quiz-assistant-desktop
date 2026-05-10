import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import assistantRouter from './routes/assistant';

const app  = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', assistantRouter);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Assistant API running on http://0.0.0.0:${PORT}`);
  console.log(`Ollama endpoint: ${process.env.OLLAMA_BASE_URL ?? 'http://129.159.235.164:11434'}`);
  console.log(`Default model:   ${process.env.OLLAMA_MODEL ?? 'phi3:latest'}`);
});
