/**
 * DigitalVision — Backend Server
 *
 * Express server providing AI proxy endpoints for intent interpretation
 * and multimodal vision analysis.
 *
 * Gemini API key stays strictly on the backend — never sent to frontend.
 *
 * Owner: Member 3 (AI)
 * See docs/CONTRACT.md §4 for the API contract.
 */

import express from 'express';
import cors from 'cors';
import {
  PORT,
  GEMINI_API_KEY,
  GEMINI_MODEL,
  REQUEST_TIMEOUT_MS,
  MAX_IMAGE_BYTES,
  MAX_BODY_LIMIT,
  ALL_INTENTS,
} from './config.js';
import { interpretCommand } from './services/intentService.js';
import { analyzeImage } from './services/visionService.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --------------- Middleware ---------------

app.use(cors());
app.use(express.json({ limit: MAX_BODY_LIMIT }));

// Serve dev test pages statically (e.g. /test-ai.html)
app.use(express.static(path.join(__dirname, '../dev')));

// Root redirect to AI test page
app.get('/', (req, res) => {
  res.redirect('/test-ai.html');
});

// Configurable request timeout middleware (~15 seconds)
app.use((req, res, next) => {
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(408).json({ error: `Request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.` });
    }
  }, REQUEST_TIMEOUT_MS);

  res.on('finish', () => clearTimeout(timer));
  res.on('close', () => clearTimeout(timer));
  next();
});

// --------------- Health Check ---------------
// GET /api/health → { status: 'ok', timestamp: string, model: string, hasKey: boolean }

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    model: GEMINI_MODEL,
    hasKey: Boolean(GEMINI_API_KEY),
  });
});

// --------------- Intent Classification ---------------
// POST /api/intent  { text, lang }  →  { intent, params, reply? }

app.post('/api/intent', async (req, res, next) => {
  try {
    const { text, lang } = req.body || {};

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "text" field.' });
    }
    if (!lang || typeof lang !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "lang" field.' });
    }

    const result = await interpretCommand(text, lang);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// --------------- Vision Analysis ---------------
// POST /api/vision  { imageBase64, intent, params, lang }
//                →  { speech, items, hazard, confidence }

app.post('/api/vision', async (req, res, next) => {
  try {
    const { imageBase64, intent, params = {}, lang } = req.body || {};

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "imageBase64" field.' });
    }
    if (!intent || typeof intent !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "intent" field.' });
    }
    if (!ALL_INTENTS.includes(intent)) {
      return res.status(400).json({ error: `Invalid intent "${intent}". Must be a supported intent string.` });
    }
    if (!lang || typeof lang !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "lang" field.' });
    }

    // Rough byte estimation: base64 characters * 3/4
    const estimatedBytes = Math.ceil(imageBase64.length * 3 / 4);
    if (estimatedBytes > MAX_IMAGE_BYTES) {
      return res.status(413).json({
        error: `Image too large (${Math.round(estimatedBytes / 1024)} KB). Maximum is ${MAX_IMAGE_BYTES / 1024} KB.`,
      });
    }

    // Do NOT log or persist uploaded image data for privacy and compliance
    const result = await analyzeImage({
      imageBase64,
      intent,
      params,
      lang,
    });

    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// --------------- Safe Error Handling ---------------

app.use((err, req, res, next) => {
  // Syntax error in JSON body
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON payload.' });
  }

  // Payload too large from express.json
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large. Maximum body limit is 1MB.' });
  }

  const statusCode = err.status || 500;
  console.error(`[DigitalVision backend] Error (${statusCode}):`, err.message);

  return res.status(statusCode).json({
    error: err.message || 'Internal server error.',
  });
});

// --------------- Start ---------------

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  app.listen(PORT, () => {
    console.log(`[DigitalVision backend] listening on http://localhost:${PORT}`);
    console.log(`[DigitalVision backend] health check: http://localhost:${PORT}/api/health`);
    console.log(`[DigitalVision backend] model configured: ${GEMINI_MODEL}`);

    if (!GEMINI_API_KEY) {
      console.warn('[DigitalVision backend] WARNING: GEMINI_API_KEY is not set.');
      console.warn('[DigitalVision backend] Intent will use keyword fallback; Vision will return 503.');
    } else {
      console.log('[DigitalVision backend] GEMINI_API_KEY is configured.');
    }
  });
}

export default app;
