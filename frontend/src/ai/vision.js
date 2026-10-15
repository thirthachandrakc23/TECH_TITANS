/**
 * DigitalVision — AI Vision Analysis Wrapper
 *
 * Thin client wrapper around POST /api/vision.
 * Enforces contract fallback and emits app:error without throwing.
 *
 * Owner: Member 3 (AI)
 * See docs/CONTRACT.md §3.3 and §4.3.
 */

import { bus } from '../core/eventBus.js';
import { APP_ERROR } from '../core/events.js';
import {
  API_BASE,
  DEFAULT_LANG,
  REQUEST_TIMEOUT_MS,
  MAX_IMAGE_SIZE_BYTES,
  HAZARD_VALUES,
  CONFIDENCE_VALUES,
} from '../config.js';

/**
 * Send a captured camera frame to the backend for AI-powered vision analysis.
 *
 * @param {Object} args
 * @param {string} args.imageBase64 - Base64-encoded image data URL (JPEG/PNG)
 * @param {string} args.intent - The classified intent string
 * @param {Object} [args.params={}] - Additional parameters from intent parsing
 * @param {string} [args.lang=DEFAULT_LANG] - Spoken language code (e.g. 'en-IN')
 * @returns {Promise<{ speech: string, items: Array, hazard: string, confidence: string }>}
 *   On failure returns: { speech: 'Analysis unavailable.', items: [], hazard: 'none', confidence: 'low' }
 */
export async function analyzeImage({
  imageBase64,
  intent,
  params = {},
  lang = DEFAULT_LANG,
}) {
  const fallback = {
    speech: 'Analysis unavailable.',
    items: [],
    hazard: 'none',
    confidence: 'low',
  };

  // Client-side validation: imageBase64 presence
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    bus.emit(APP_ERROR, {
      source: 'ai',
      message: 'Vision analysis called without valid image data.',
      recoverable: true,
    });
    return fallback;
  }

  // Client-side validation: intent presence
  if (!intent || typeof intent !== 'string') {
    bus.emit(APP_ERROR, {
      source: 'ai',
      message: 'Vision analysis called without valid intent.',
      recoverable: true,
    });
    return fallback;
  }

  // Pre-flight image size check
  const estimatedBytes = Math.ceil(imageBase64.length * 3 / 4);
  if (estimatedBytes > MAX_IMAGE_SIZE_BYTES) {
    bus.emit(APP_ERROR, {
      source: 'ai',
      message: `Image size (${Math.round(estimatedBytes / 1024)} KB) exceeds maximum allowed size (${MAX_IMAGE_SIZE_BYTES / 1024} KB).`,
      recoverable: true,
    });
    return fallback;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res;
    try {
      res = await fetch(`${API_BASE}/vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          intent,
          params,
          lang,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    const data = await res.json();

    return {
      speech: typeof data.speech === 'string' && data.speech.trim()
        ? data.speech.trim()
        : 'Scene analyzed.',
      items: Array.isArray(data.items) ? data.items : [],
      hazard: HAZARD_VALUES.includes(data.hazard) ? data.hazard : 'none',
      confidence: CONFIDENCE_VALUES.includes(data.confidence) ? data.confidence : 'low',
    };
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    const message = isTimeout
      ? 'Vision request timed out after 15 seconds.'
      : `Vision request failed: ${err.message}`;

    bus.emit(APP_ERROR, {
      source: 'ai',
      message,
      recoverable: true,
    });

    return fallback;
  }
}
