/**
 * DigitalVision — AI Intent Interpretation Wrapper
 *
 * Thin client wrapper around POST /api/intent.
 * Enforces contract fallback and emits app:error without throwing.
 *
 * Owner: Member 3 (AI)
 * See docs/CONTRACT.md §3.3 and §4.2.
 */

import { bus } from '../core/eventBus.js';
import { APP_ERROR } from '../core/events.js';
import { API_BASE, DEFAULT_LANG, REQUEST_TIMEOUT_MS } from '../config.js';

/**
 * Send a voice command to the backend for intent classification.
 *
 * @param {string} text - The recognized speech transcript
 * @param {string} [lang=DEFAULT_LANG] - Spoken language code (e.g. 'en-IN')
 * @returns {Promise<{ intent: string, params: object, reply?: string }>}
 *   On failure returns: { intent: 'UNKNOWN', params: {}, reply: 'Sorry, I could not understand.' }
 */
export async function interpretCommand(text, lang = DEFAULT_LANG) {
  const fallback = {
    intent: 'UNKNOWN',
    params: {},
    reply: 'Sorry, I could not understand.',
  };

  if (!text || typeof text !== 'string') {
    bus.emit(APP_ERROR, {
      source: 'ai',
      message: 'Intent interpretation called without valid text.',
      recoverable: true,
    });
    return fallback;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res;
    try {
      res = await fetch(`${API_BASE}/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang }),
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
      intent: typeof data.intent === 'string' ? data.intent : 'UNKNOWN',
      params: data.params && typeof data.params === 'object' ? data.params : {},
      ...(typeof data.reply === 'string' && data.reply ? { reply: data.reply } : {}),
    };
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    const message = isTimeout
      ? 'Intent request timed out after 15 seconds.'
      : `Intent request failed: ${err.message}`;

    bus.emit(APP_ERROR, {
      source: 'ai',
      message,
      recoverable: true,
    });

    return fallback;
  }
}
