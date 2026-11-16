import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '512kb' }));

  app.get(['/sql-wasm.wasm', '/sql-wasm-browser.wasm'], (req, res) => {
    const filename = path.basename(req.path);
    const wasmPath = path.resolve(__dirname, 'public', filename);
    if (fs.existsSync(wasmPath)) {
      res.setHeader('Content-Type', 'application/wasm');
      return res.sendFile(wasmPath);
    }
    return res.status(404).end();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, aiConfigured: Boolean(process.env.GEMINI_API_KEY) });
  });

  // Optional AI-assisted explanation endpoint (strictly requires explicit user consent flag)
  app.post('/api/explain', async (req, res) => {
    try {
      const { userConsented, filePath, formatName, snippet } = req.body as {
        userConsented?: boolean;
        filePath?: string;
        formatName?: string;
        snippet?: string;
      };

      if (!userConsented) {
        return res.status(400).json({ error: 'Explicit user consent is required before uploading file snippets.' });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY is not configured in server secrets. Offline explanations remain fully available.',
        });
      }

      const ai = new GoogleGenAI({ apiKey });
      const prompt = [
        `You are an Android reverse-engineering specialist.`,
        `Explain the following APK file strictly based on the provided metadata and excerpt. Do not invent facts not supported by the snippet.`,
        `File path: ${String(filePath || 'unknown').slice(0, 260)}`,
        `Detected format: ${String(formatName || 'unknown').slice(0, 120)}`,
        `Excerpt:`,
        `\`\`\``,
        String(snippet || '').slice(0, 6000),
        `\`\`\``,
        `Provide: (1) Purpose in an Android APK, (2) Key technical observations from the excerpt, (3) Security or architecture notes.`,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      return res.json({ explanation: response.text || 'No explanation returned.' });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to generate explanation.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ANDROID X-RAY workstation server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
