/**
 * DigitalVision — Local & Hybrid Intent Interpretation Service
 *
 * Provides instant, zero-cost, offline-first intent classification for voice commands.
 * Matches spoken phrases in English, Kannada, and Hindi.
 * If backend is reachable, delegates complex phrases to backend /api/intent.
 */

import { API_BASE, DEFAULT_LANG } from '../config.js';
import {
  DESCRIBE_SURROUNDINGS,
  READ_TEXT,
  FIND_OBJECT,
  FIND_WASHROOM,
  NAVIGATE_HELP,
  OBSTACLE_CHECK,
  START_MONITORING,
  STOP,
  REPEAT,
  HELP,
  CHAT,
  UNKNOWN,
} from '../core/intents.js';

/**
 * Deterministic local keyword intent matcher.
 * Covers full hackathon scenarios without requiring any backend server or API key.
 *
 * @param {string} rawText
 * @param {string} [lang=DEFAULT_LANG]
 * @returns {{ intent: string, params: object, reply?: string }}
 */
export function matchLocalIntent(rawText, _lang = DEFAULT_LANG) {
  if (!rawText || typeof rawText !== 'string') {
    return {
      intent: UNKNOWN,
      params: {},
      reply: 'I could not hear any command. Please speak again.',
    };
  }

  const text = rawText.trim();
  const lower = text.toLowerCase();

  // 1. STOP / PAUSE / SILENCE
  if (
    /(^|\b)(stop|halt|pause|cancel|be quiet|shut up|silence|stop talking|stop describing|stop reading|stop navigation)(\b|$)/i.test(lower) ||
    /(^|\b)(ನಿಲ್ಲು|nillu|saaku|saku|nillisi)(\b|$)/i.test(lower) ||
    /(^|\b)(ruk jao|ruko|bas karo|band karo|roko)(\b|$)/i.test(lower)
  ) {
    return {
      intent: STOP,
      params: {},
      reply: 'Stopping. What would you like to do next?',
    };
  }

  // 2. REPEAT
  if (
    /(repeat|say again|what did you say|say that again|pardon|come again)/i.test(lower) ||
    /(ಮತ್ತೆ ಹೇಳು|matte helu|innomme helu|matte heli)/i.test(lower) ||
    /(phir se bolo|kya bola|dobara bolo|wapas bolo)/i.test(lower)
  ) {
    return {
      intent: REPEAT,
      params: {},
    };
  }

  // 3. HELP / CAPABILITIES
  if (
    /(help|what can you do|what are the commands|list commands|show commands|supported commands|options|instructions|how does this work|how do i use this|what are my options)/i.test(lower) ||
    /^(commands|options|help me)$/i.test(lower) ||
    /(need help|give me help|tell me commands)/i.test(lower) ||
    /(ಸಹಾಯ|sahaya|enu madabahudu|sahaya beku)/i.test(lower) ||
    /(madad|help chahiye|kya kar sakte ho|commands batao|sahayata)/i.test(lower)
  ) {
    return {
      intent: HELP,
      params: {},
      reply: 'You can talk to me directly! Say: "read book" to read printed pages, "navigate to door" or "navigate from place to place" for walking guidance, "describe surroundings" to inspect the scene, "find keys" to locate an object, or "stop" at any time.',
    };
  }

  // 4. READ_TEXT / READ_BOOK (Reading books, novels, documents, signs)
  if (
    /(read\s+(?:a\s+|the\s+|this\s+)?(?:book|books|page|novel|document|text|sign|label|board|passage)|reading\s+(?:a\s+)?books?|book\s+reading|start\s+reading|read\s+this|what does it say|can you read|ocr|read\s+page|next\s+page)/i.test(lower) ||
    /^(read|text|book|books|read book|read books|read page)$/i.test(lower) ||
    /(ಓದು|oodu|idu oodu|pustaka oodu|baraha oodu|pathisu|enu baredide)/i.test(lower) ||
    /(padho|kitab padho|pustak padho|kya likha hai|likha padho|board padho|yeh padho)/i.test(lower)
  ) {
    const isBook = /(book|novel|page|kitab|pustak|pustaka|document)/i.test(lower);
    return {
      intent: READ_TEXT,
      params: isBook ? { type: 'book' } : { type: 'general' },
      reply: isBook
        ? 'Activating book reading mode. Please hold your book or page in front of the camera.'
        : 'Activating text reading. Point your camera at the text or sign.',
    };
  }

  // 5. NAVIGATE_HELP (Place-to-place navigation & walking guidance)
  const navDestinationMatch = lower.match(
    /(?:navigate\s+to|guide\s+me\s+to|take\s+me\s+to|path\s+to|walk\s+to|lead\s+me\s+to|how\s+to\s+get\s+to)\s+(?:the\s+|a\s+)?(.+)/i
  );
  if (navDestinationMatch) {
    const destination = navDestinationMatch[1].replace(/[?.!]+$/, '').trim();
    return {
      intent: NAVIGATE_HELP,
      params: { destination },
      reply: `Starting navigation mode for ${destination}. I will monitor your walking path and guide your steps.`,
    };
  }

  if (
    /(navigate(\s+from\s+place\s+to\s+place)?|navigation(\s+mode)?|guide me|which way|directions|help me walk|navigation help|lead the way|where should i walk|path clear|guide my walk)/i.test(lower) ||
    /^(navigate|navigation|walking guidance)$/i.test(lower) ||
    /(ದಾರಿ ತೋರಿಸು|dari torisu|margadarshana|elli hogabeku)/i.test(lower) ||
    /(rasta dikhao|kidhar jana hai|guide karo|rasta batao|navigation)/i.test(lower)
  ) {
    return {
      intent: NAVIGATE_HELP,
      params: {},
      reply: 'Starting navigation guidance. Walk slowly and I will announce clear paths, obstacles, and doorways ahead.',
    };
  }

  // 6. FIND_WASHROOM
  if (
    /(find|where is|locate|search for|look for).*(washroom|restroom|toilet|bathroom|loo)/i.test(lower) ||
    /^(washroom|restroom|toilet|bathroom|loo)$/i.test(lower) ||
    /(ಶೌಚಾಲಯ|shouchalaya|shauchalaya|snanagruha|toilet ellide)/i.test(lower) ||
    /(shauchalay|bathroom kahan hai|toilet kahan hai|washroom kahan hai)/i.test(lower)
  ) {
    return {
      intent: FIND_WASHROOM,
      params: {},
      reply: 'Searching for washroom or restroom indicators in view.',
    };
  }

  // 7. FIND_OBJECT
  const findEnMatch = lower.match(
    /^(?:find|where is(?: my)?|look for|locate|search for|can you see(?: my)?|point to(?: my)?)\s+(?:a |an |the |my )?(.+)/i
  );
  if (findEnMatch && !/(washroom|restroom|toilet|bathroom|loo)/i.test(findEnMatch[1])) {
    const target = findEnMatch[1].replace(/[?.!]+$/, '').trim();
    if (target) {
      return {
        intent: FIND_OBJECT,
        params: { target },
        reply: `Looking for ${target}. Please pan your camera slowly around the room.`,
      };
    }
  }

  const findKnMatch = lower.match(/(.+?)\s+(?:huduku|ellide|ಹುಡುಕು)/i);
  if (findKnMatch && !/(shouchalaya|shauchalaya|snanagruha|toilet)/i.test(findKnMatch[1])) {
    const target = findKnMatch[1].replace(/[?.!]+$/, '').trim();
    if (target) {
      return {
        intent: FIND_OBJECT,
        params: { target },
        reply: `Looking for ${target}.`,
      };
    }
  }

  const findHiMatch =
    lower.match(/(?:dhundho|khojo)\s+(.+)/i) ||
    lower.match(/(.+?)\s+(?:dhundho|kahan hai|khojo)/i);
  if (findHiMatch && !/(shauchalay|bathroom|toilet|washroom)/i.test(findHiMatch[1])) {
    const target = findHiMatch[1].replace(/[?.!]+$/, '').trim();
    if (target) {
      return {
        intent: FIND_OBJECT,
        params: { target },
        reply: `Looking for ${target}.`,
      };
    }
  }

  // 8. OBSTACLE_CHECK
  if (
    /(obstacle|hazard|trip|in my way|hit something|watch out|anything in front|check path|walking hazard|is my path clear)/i.test(lower) ||
    /(ಅಡಚಣೆ|adachane|adachane ideya|mundhe enide)/i.test(lower) ||
    /(rukawat|koi rukawat|obstacle hai|mere raste|aage kya hai)/i.test(lower)
  ) {
    return {
      intent: OBSTACLE_CHECK,
      params: {},
      reply: 'Checking walking path for obstacles and hazards.',
    };
  }

  // 9. START_MONITORING
  if (
    /(start monitoring|monitor continuously|keep watching|continuous mode|start surveillance|watch my surroundings)/i.test(lower) ||
    /(ಮೇಲ್ವಿಚಾರಣೆ|monitoring prarambhisu|noduta iru)/i.test(lower) ||
    /(monitoring shuru karo|dekhte raho|lagatar dekho)/i.test(lower)
  ) {
    return {
      intent: START_MONITORING,
      params: {},
      reply: 'Starting continuous monitoring.',
    };
  }

  // 10. DESCRIBE_SURROUNDINGS
  if (
    /(describe surroundings|what's around me|what is around me|look around|what is in front of me|what do you see|describe scene|tell me what you see|what is here|surroundings|scan)/i.test(lower) ||
    /^(describe|look|what is this|scan surroundings)$/i.test(lower) ||
    /(ಸುತ್ತಮುತ್ತ|suttamutta|suttamuthalu|en kanstide|munbhaga enide)/i.test(lower) ||
    /(aas paas kya hai|kya dikh raha hai|charo taraf|samne kya hai|aas paas)/i.test(lower)
  ) {
    return {
      intent: DESCRIBE_SURROUNDINGS,
      params: {},
      reply: 'Starting surroundings scan. Please hold your camera steady.',
    };
  }

  // 11. CHAT & PLEASANTRIES
  if (
    /(^|\b)(hello|hi|hey|good morning|good afternoon|good evening|how are you|who are you|what is your name|thank you|thanks)(\b|$)/i.test(lower) ||
    /(^|\b)(ನಮಸ್ಕಾರ|namaskara|hegiddira|dhanyavada)(\b|$)/i.test(lower) ||
    /(^|\b)(namaste|pranam|kaise ho|dhanyawad|shukriya)(\b|$)/i.test(lower)
  ) {
    let reply = 'Hello! I am DigitalVision, your voice-activated surroundings assistant. How can I help you today?';
    if (/thank/i.test(lower) || /dhanya/i.test(lower) || /shukriya/i.test(lower)) {
      reply = 'You are very welcome! What would you like me to assist with next?';
    } else if (/who are you|what is your name/i.test(lower)) {
      reply = 'I am DigitalVision, an assistive voice and vision system built for the visually impaired. You can speak commands directly to me.';
    }
    return {
      intent: CHAT,
      params: {},
      reply,
    };
  }

  // 12. Fallback UNKNOWN
  return {
    intent: UNKNOWN,
    params: {},
    reply: 'I heard you, but I did not understand that command. You can say: "navigate to room", "read book", "describe surroundings", or "help".',
  };
}

/**
 * Interpret a voice command with offline-first priority and optional backend fallback.
 *
 * @param {string} text
 * @param {string} [lang=DEFAULT_LANG]
 * @returns {Promise<{ intent: string, params: object, reply?: string }>}
 */
export async function interpretVoiceCommand(text, lang = DEFAULT_LANG) {
  // Always perform local fast classification first
  const localMatch = matchLocalIntent(text, lang);

  // If local match is definite (not UNKNOWN), return immediately for zero-lag responsiveness
  if (localMatch.intent !== UNKNOWN) {
    return localMatch;
  }

  // If local match was UNKNOWN, attempt backend Gemini classification if backend is reachable
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(`${API_BASE}/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (res.ok) {
      const data = await res.json();
      if (data && data.intent) {
        return {
          intent: data.intent,
          params: data.params || {},
          reply: data.reply || localMatch.reply,
        };
      }
    }
  } catch {
    // Backend unreachable — return graceful local fallback
  }

  return localMatch;
}
