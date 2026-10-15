/**
 * DigitalVision — Backend Server
 *
 * Express server providing AI proxy endpoints.
 * Gemini API key stays here — never sent to the frontend.
 *
 * Owner: Member 3 (AI routes), Team Lead (scaffold)
 * See docs/CONTRACT.md §4 for the API contract.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

// --------------- Middleware ---------------

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// --------------- Health Check ---------------

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --------------- Intent Classification ---------------
// POST /api/intent  { text, lang }  →  { intent, params, reply? }

app.post('/api/intent', (req, res) => {
  const { text, lang } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "text" field.' });
  }
  if (!lang || typeof lang !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "lang" field.' });
  }

  // TODO: Member 3 — replace with Gemini API call for intent classification
  res.status(501).json({ error: 'Intent classification not implemented yet.' });
});

// --------------- Vision Analysis ---------------
// POST /api/vision  { imageBase64, intent, params, lang }
//                →  { speech, items, hazard, confidence }

app.post('/api/vision', (req, res) => {
  const { imageBase64, intent, lang } = req.body;

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "imageBase64" field.' });
  }
  if (!intent || typeof intent !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "intent" field.' });
  }
  if (!lang || typeof lang !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "lang" field.' });
  }

  // Check image size (rough base64 size — actual bytes ≈ 3/4 of string length)
  const estimatedBytes = Math.ceil(imageBase64.length * 3 / 4);
  const MAX_IMAGE_BYTES = 512 * 1024; // 512 KB
  if (estimatedBytes > MAX_IMAGE_BYTES) {
    return res.status(413).json({
      error: `Image too large (${Math.round(estimatedBytes / 1024)} KB). Maximum is ${MAX_IMAGE_BYTES / 1024} KB.`,
    });
  }

  // TODO: Member 3 — replace with Gemini API call for vision analysis
  // Do NOT log or persist the image.
  res.status(501).json({ error: 'Vision analysis not implemented yet.' });
});

// --------------- Start ---------------

app.listen(PORT, () => {
  console.log(`[DigitalVision backend] listening on http://localhost:${PORT}`);
  console.log(`[DigitalVision backend] health check: http://localhost:${PORT}/api/health`);

  if (!process.env.GEMINI_API_KEY) {
    console.warn('[DigitalVision backend] WARNING: GEMINI_API_KEY not set. AI routes will not work.');
  }
});
