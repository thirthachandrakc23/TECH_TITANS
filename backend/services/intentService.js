/**
 * DigitalVision — Intent Classification Service
 *
 * Implements intent interpretation using Google Gemini multimodal model
 * with deterministic keyword fallback covering English, Kannada, and Hindi.
 *
 * Owner: Member 3 (AI)
 */

import { GoogleGenAI } from '@google/genai';
import {
  ALL_INTENTS,
  GEMINI_API_KEY,
  GEMINI_MODEL,
  REQUEST_TIMEOUT_MS,
} from '../config.js';

let genAIClient = null;

/**
 * Lazily initialize Google Gen AI client.
 */
function getGenAIClient() {
  if (!genAIClient && GEMINI_API_KEY) {
    genAIClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }
  return genAIClient;
}

/**
 * Deterministic keyword-based fallback intent classifier.
 * Supports English phrases and examples in Kannada/Hindi.
 *
 * @param {string} text - User command text
 * @param {string} [lang='en-IN'] - Language code
 * @returns {{ intent: string, params: object, reply?: string }}
 */
export function matchKeywordIntent(text, lang = 'en-IN') {
  if (!text || typeof text !== 'string') {
    return {
      intent: 'UNKNOWN',
      params: {},
      reply: 'Sorry, I could not understand.',
    };
  }

  const raw = text.trim();
  const lower = raw.toLowerCase();

  // 1. STOP
  if (
    /(^|\b)(stop|halt|pause|cancel|be quiet|shut up|silence|stop talking)(\b|$)/i.test(lower) ||
    /(^|\b)(ನಿಲ್ಲು|nillu|saaku|saku|nillisi)(\b|$)/i.test(lower) ||
    /(^|\b)(ruk jao|ruko|bas karo|band karo|roko)(\b|$)/i.test(lower)
  ) {
    return {
      intent: 'STOP',
      params: {},
      reply: 'Stopping.',
    };
  }

  // 2. REPEAT
  if (
    /(repeat|say again|what did you say|say that again|pardon|come again)/i.test(lower) ||
    /(ಮತ್ತೆ ಹೇಳು|matte helu|innomme helu|matte heli)/i.test(lower) ||
    /(phir se bolo|kya bola|dobara bolo|wapas bolo)/i.test(lower)
  ) {
    return {
      intent: 'REPEAT',
      params: {},
    };
  }

  // 3. HELP
  if (
    /(help|what can you do|what are the commands|list commands|show commands|supported commands|options|instructions|how does this work|how do i use this)/i.test(lower) ||
    /^(commands)$/i.test(lower) ||
    /(need help|give me help|tell me commands)/i.test(lower) ||
    /(ಸಹಾಯ|sahaya|enu madabahudu|sahaya beku)/i.test(lower) ||
    /(madad|help chahiye|kya kar sakte ho|commands batao|sahayata)/i.test(lower)
  ) {
    return {
      intent: 'HELP',
      params: {},
      reply: 'I can describe surroundings, read text, find objects or washrooms, check for obstacles, or start continuous monitoring. What would you like to do?',
    };
  }

  // 4. START_MONITORING
  if (
    /(start monitoring|monitor continuously|keep watching|continuous mode|start surveillance|watch my surroundings)/i.test(lower) ||
    /(ಮೇಲ್ವಿಚಾರಣೆ|monitoring prarambhisu|noduta iru)/i.test(lower) ||
    /(monitoring shuru karo|dekhte raho|lagatar dekho)/i.test(lower)
  ) {
    return {
      intent: 'START_MONITORING',
      params: {},
      reply: 'Starting continuous monitoring.',
    };
  }

  // 5. FIND_WASHROOM
  if (
    /(find|where is|locate|search for|look for).*(washroom|restroom|toilet|bathroom|loo)/i.test(lower) ||
    /^(washroom|restroom|toilet|bathroom|loo)$/i.test(lower) ||
    /(ಶೌಚಾಲಯ|shouchalaya|shauchalaya|snanagruha|toilet ellide)/i.test(lower) ||
    /(shauchalay|bathroom kahan hai|toilet kahan hai|washroom kahan hai)/i.test(lower)
  ) {
    return {
      intent: 'FIND_WASHROOM',
      params: {},
    };
  }

  // 6. FIND_OBJECT
  // English: find [x], where is my [x], look for [x]
  const findEnMatch = lower.match(/^(?:find|where is(?: my)?|look for|locate|search for|can you see(?: my)?)\s+(?:a |an |the |my )?(.+)/i);
  if (findEnMatch && !/(washroom|restroom|toilet|bathroom|loo)/i.test(findEnMatch[1])) {
    const target = findEnMatch[1].replace(/[?.!]+$/, '').trim();
    if (target) {
      return {
        intent: 'FIND_OBJECT',
        params: { target },
      };
    }
  }

  // Kannada: [x] huduku / [x] ellide
  const findKnMatch = lower.match(/(.+?)\s+(?:huduku|ellide|ಹುಡುಕು)/i);
  if (findKnMatch && !/(shouchalaya|shauchalaya|snanagruha|toilet)/i.test(findKnMatch[1])) {
    const target = findKnMatch[1].replace(/[?.!]+$/, '').trim();
    if (target) {
      return {
        intent: 'FIND_OBJECT',
        params: { target },
      };
    }
  }

  // Hindi: [x] dhundho / [x] kahan hai / khojo [x]
  const findHiMatch = lower.match(/(?:dhundho|khojo)\s+(.+)/i) || lower.match(/(.+?)\s+(?:dhundho|kahan hai|khojo)/i);
  if (findHiMatch && !/(shauchalay|bathroom|toilet|washroom)/i.test(findHiMatch[1])) {
    const target = findHiMatch[1].replace(/[?.!]+$/, '').trim();
    if (target) {
      return {
        intent: 'FIND_OBJECT',
        params: { target },
      };
    }
  }

  // 7. OBSTACLE_CHECK
  if (
    /(obstacle|hazard|trip|in my way|hit something|watch out|anything in front|check path|walking hazard)/i.test(lower) ||
    /(ಅಡಚಣೆ|adachane|adachane ideya|mundhe enide)/i.test(lower) ||
    /(rukawat|koi rukawat|obstacle hai|mere raste|aage kya hai)/i.test(lower)
  ) {
    return {
      intent: 'OBSTACLE_CHECK',
      params: {},
    };
  }

  // 8. READ_TEXT
  if (
    /(read text|read this|what does it say|read the sign|read document|read label|read board|can you read|ocr)/i.test(lower) ||
    /^(read|text)$/i.test(lower) ||
    /(ಓದು|oodu|idu oodu|baraha oodu|pathisu|enu baredide)/i.test(lower) ||
    /(padho|kya likha hai|likha padho|board padho|yeh padho)/i.test(lower)
  ) {
    return {
      intent: 'READ_TEXT',
      params: {},
    };
  }

  // 9. NAVIGATE_HELP
  if (
    /(navigate|guide me|which way|directions|help me walk|navigation help|lead the way|path to)/i.test(lower) ||
    /(ದಾರಿ ತೋರಿಸು|dari torisu|margadarshana|elli hogabeku)/i.test(lower) ||
    /(rasta dikhao|kidhar jana hai|guide karo|rasta batao|navigation)/i.test(lower)
  ) {
    return {
      intent: 'NAVIGATE_HELP',
      params: {},
    };
  }

  // 10. DESCRIBE_SURROUNDINGS
  if (
    /(describe surroundings|what's around me|what is around me|look around|what is in front of me|what do you see|describe scene|tell me what you see|what is here|surroundings)/i.test(lower) ||
    /^(describe|look|what is this)$/i.test(lower) ||
    /(ಸುತ್ತಮುತ್ತ|suttamutta|suttamuthalu|en kanstide|munbhaga enide)/i.test(lower) ||
    /(aas paas kya hai|kya dikh raha hai|charo taraf|samne kya hai|aas paas)/i.test(lower)
  ) {
    return {
      intent: 'DESCRIBE_SURROUNDINGS',
      params: {},
    };
  }

  // 11. CHAT
  if (
    /(^|\b)(hello|hi|hey|good morning|good afternoon|good evening|how are you|who are you|what is your name|thank you|thanks)(\b|$)/i.test(lower) ||
    /(^|\b)(ನಮಸ್ಕಾರ|namaskara|hegiddira|dhanyavada)(\b|$)/i.test(lower) ||
    /(^|\b)(namaste|pranam|kaise ho|dhanyawad|shukriya)(\b|$)/i.test(lower)
  ) {
    let reply = 'Hello! I am DigitalVision, your surroundings assistant. How can I help you today?';
    if (/thank/i.test(lower) || /dhanya/i.test(lower) || /shukriya/i.test(lower)) {
      reply = 'You are welcome! Let me know if you need any more assistance.';
    }
    return {
      intent: 'CHAT',
      params: {},
      reply,
    };
  }

  // 12. UNKNOWN fallback
  return {
    intent: 'UNKNOWN',
    params: {},
    reply: 'Sorry, I could not understand. You can say "describe surroundings", "read text", "find washroom", or "help".',
  };
}

/**
 * Classify command using Gemini Flash model, with automatic fallback.
 *
 * @param {string} text - User command text
 * @param {string} [lang='en-IN'] - Language code
 * @returns {Promise<{ intent: string, params: object, reply?: string }>}
 */
export async function interpretCommand(text, lang = 'en-IN') {
  if (!text || typeof text !== 'string') {
    return {
      intent: 'UNKNOWN',
      params: {},
      reply: 'Sorry, I could not understand.',
    };
  }

  const client = getGenAIClient();
  if (!client) {
    // No API key configured — use deterministic keyword fallback
    return matchKeywordIntent(text, lang);
  }

  try {
    const prompt = `You are an intent classification assistant for DigitalVision, an assistive vision application for visually impaired users.
Analyze the user's spoken command and language, and classify it into exactly ONE of these supported intents:
- DESCRIBE_SURROUNDINGS: user wants to know what is around them or what the camera sees.
- READ_TEXT: user wants text/signs/labels/documents read aloud.
- FIND_OBJECT: user is searching for a specific object (extract object name into params.target).
- FIND_WASHROOM: user is looking for a washroom, toilet, restroom.
- NAVIGATE_HELP: user wants guidance on walking path, direction, or landmarks.
- OBSTACLE_CHECK: user wants to check if there are hazards or obstacles in their path.
- START_MONITORING: user wants continuous automatic scene monitoring.
- STOP: user wants to stop, pause, halt, cancel, or silence current actions.
- REPEAT: user wants the previous message or response repeated.
- HELP: user is asking for available commands, capabilities, or instructions.
- CHAT: conversational pleasantries (greetings, identity, thanks).
- UNKNOWN: command is unclear, unintelligible, or not a supported feature.

User spoken text: "${text.replace(/"/g, '\\"')}"
User language: "${lang}"

Respond with strict JSON ONLY in this format:
{
  "intent": "<ONE_OF_THE_ABOVE_INTENTS>",
  "params": { "target": "<string target if FIND_OBJECT, otherwise omit>" },
  "reply": "<short spoken reply if HELP, CHAT, or UNKNOWN; otherwise omit>"
}

Rules:
1. Do NOT invent new intents. Must be one of the listed 12 intents.
2. If the user command is vague or unsupported, classify as UNKNOWN and set reply to explain supported commands or ask them to repeat.
3. Understand English, Kannada, Hindi, or transliterated phrases.`;

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Intent classification timed out')), REQUEST_TIMEOUT_MS);
    });

    const apiPromise = client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const response = await Promise.race([apiPromise, timeoutPromise]);
    const rawText = response.text?.trim() || '';

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Try extracting JSON from markdown fences if model returned them
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('Failed to parse model JSON');
      }
    }

    if (parsed && typeof parsed.intent === 'string' && ALL_INTENTS.includes(parsed.intent)) {
      return {
        intent: parsed.intent,
        params: parsed.params && typeof parsed.params === 'object' ? parsed.params : {},
        ...(parsed.reply ? { reply: String(parsed.reply) } : {}),
      };
    }

    // Invalid intent returned by model — fall back to keyword matching
    return matchKeywordIntent(text, lang);
  } catch (err) {
    console.warn(`[IntentService] Gemini classification failed (${err.message}), using keyword fallback.`);
    return matchKeywordIntent(text, lang);
  }
}
