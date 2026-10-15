/**
 * DigitalVision — Vision Analysis Service
 *
 * Implements multimodal image analysis using Gemini Flash.
 * Enforces contract schema, fallible hazard classification, position awareness,
 * and safety disclaimers.
 *
 * Owner: Member 3 (AI)
 */

import { GoogleGenAI } from '@google/genai';
import {
  GEMINI_API_KEY,
  GEMINI_MODEL,
  REQUEST_TIMEOUT_MS,
  HAZARD_LEVELS,
  CONFIDENCE_LEVELS,
} from '../config.js';

let genAIClient = null;

function getGenAIClient() {
  if (!genAIClient && GEMINI_API_KEY) {
    genAIClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }
  return genAIClient;
}

/**
 * Parse base64 string into mimeType and raw base64 data.
 * @param {string} rawString
 * @returns {{ mimeType: string, data: string }}
 */
function extractImageBytes(rawString) {
  const match = rawString.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (match) {
    return {
      mimeType: match[1],
      data: match[2],
    };
  }
  return {
    mimeType: 'image/jpeg',
    data: rawString,
  };
}

/**
 * Build intent-specific instruction prompt for the vision model.
 *
 * @param {string} intent
 * @param {object} params
 * @returns {string}
 */
function buildIntentPrompt(intent, params = {}) {
  switch (intent) {
    case 'READ_TEXT':
      return 'TASK: Read all visible, legible printed or handwritten text, room numbers, signs, notices, or labels. Read them accurately. If no text is clearly legible, explicitly state: "No readable text visible."';

    case 'FIND_WASHROOM':
      return 'TASK: Search specifically for washroom, restroom, toilet signs, symbols (male, female, accessible, unisex), or doors. State clearly if a washroom indicator is seen and its position (e.g. "on your left", "straight ahead"). If not visible, state that clearly.';

    case 'FIND_OBJECT': {
      const target = params && params.target ? params.target : 'the requested object';
      return `TASK: Look specifically for "${target}". State clearly whether "${target}" is detected in the image and its relative position (e.g. "on your left on the desk", "directly ahead"). If not found, explicitly state that "${target}" was not detected.`;
    }

    case 'OBSTACLE_CHECK':
      return 'TASK: Inspect the walking path in front for potential obstacles, trip hazards, stairs, steps, drop-offs, low-hanging items, clutter, wires, or furniture. State any potential hazards and their relative position.';

    case 'NAVIGATE_HELP':
      return 'TASK: Provide orientation and navigation guidance based on visible landmarks, open doorways, corridors, pathways, or turns. Indicate relative direction (e.g. "open corridor ahead", "doorway to your right").';

    case 'DESCRIBE_SURROUNDINGS':
    default:
      return 'TASK: Describe the immediate surroundings. Prioritize any potential hazards or obstacles first, then describe key objects, people, and layout.';
  }
}

/**
 * Analyze an image using Gemini Flash multimodal model.
 *
 * @param {Object} args
 * @param {string} args.imageBase64 - Base64 encoded image string
 * @param {string} args.intent - The classified intent
 * @param {object} [args.params={}] - Additional parameters
 * @param {string} [args.lang='en-IN'] - Requested spoken response language
 * @returns {Promise<{ speech: string, items: Array, hazard: string, confidence: string }>}
 */
export async function analyzeImage({ imageBase64, intent, params = {}, lang = 'en-IN' }) {
  if (!GEMINI_API_KEY) {
    const err = new Error(
      'AI vision service unavailable: GEMINI_API_KEY is not configured on the server. Please set GEMINI_API_KEY in backend/.env'
    );
    err.status = 503;
    throw err;
  }

  const client = getGenAIClient();
  const { mimeType, data: cleanBase64 } = extractImageBytes(imageBase64);
  const intentSpecificTask = buildIntentPrompt(intent, params);

  const prompt = `You are the vision AI engine for DigitalVision, an assistive system for visually impaired users.
Analyze the provided camera frame.

${intentSpecificTask}

CORE INSTRUCTIONS:
1. Limit spoken answer ("speech") to a maximum of THREE SHORT SENTENCES.
2. Prioritize potentially relevant hazards or obstacles first, then useful scene information.
3. Describe image-relative positions (left, right, center, foreground, background).
4. Never invent signs, text, objects, distances, or confidence. If unsure, state uncertainty.
5. Language: Provide the "speech" description in the requested language: "${lang}" (translate natural spoken speech to this language, e.g. English, Hindi, Kannada, etc.).
6. SAFETY MANDATE: A single ordinary 2D RGB image cannot reliably establish exact physical distance or guarantee collision avoidance. Never claim the route is completely safe merely because no obstacle was identified. Treat hazard classifications as fallible estimates, not safety guarantees. Do not label a hazard as physically near unless clearly visible in the foreground.

Return strict JSON ONLY with this exact schema:
{
  "speech": "Short spoken description (maximum 3 concise sentences) in ${lang}",
  "items": [
    {
      "label": "name of detected object or landmark",
      "confidence": 0.85,
      "location": "left | center | right | foreground | background"
    }
  ],
  "hazard": "none | caution | danger",
  "confidence": "low | medium | high"
}`;

  const timeoutPromise = new Promise((_, reject) => {
    const timer = setTimeout(() => {
      const err = new Error('Vision analysis timed out after 15 seconds.');
      err.status = 408;
      reject(err);
    }, REQUEST_TIMEOUT_MS);
    // Allow process to exit cleanly if needed
    if (timer.unref) timer.unref();
  });

  const apiPromise = client.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  });

  let response;
  try {
    response = await Promise.race([apiPromise, timeoutPromise]);
  } catch (err) {
    if (err.status) throw err;
    const error = new Error(`Gemini API error: ${err.message}`);
    error.status = 503;
    throw error;
  }

  const rawText = response.text?.trim() || '';

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[1]);
      } catch {
        // Fall back below
      }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      speech: rawText.slice(0, 200) || 'Image analyzed.',
      items: [],
      hazard: 'none',
      confidence: 'low',
    };
  }

  // Validate and clamp output fields strictly to the contract
  const speech = typeof parsed.speech === 'string' && parsed.speech.trim()
    ? parsed.speech.trim()
    : 'Scene analyzed.';

  const hazard = HAZARD_LEVELS.includes(parsed.hazard) ? parsed.hazard : 'none';
  const confidence = CONFIDENCE_LEVELS.includes(parsed.confidence) ? parsed.confidence : 'medium';

  const items = Array.isArray(parsed.items)
    ? parsed.items
        .filter((item) => item && typeof item.label === 'string')
        .map((item) => ({
          label: String(item.label),
          confidence: typeof item.confidence === 'number'
            ? Math.max(0, Math.min(1, item.confidence))
            : 0.7,
          location: typeof item.location === 'string' ? item.location : 'center',
        }))
    : [];

  return {
    speech,
    items,
    hazard,
    confidence,
  };
}
