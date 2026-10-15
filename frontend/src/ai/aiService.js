/**
 * DigitalVision — AI Service (STUB)
 *
 * Owner: Member 3 (implementation), Team Lead (contract)
 * See docs/CONTRACT.md §3.3 and §4 for the full interface and API contract.
 *
 * This file provides the agreed function signatures with JSDoc.
 * Member 3 replaces the stub bodies with real fetch calls to the backend.
 */

import { bus } from '../core/eventBus.js';
import { APP_ERROR } from '../core/events.js';
import { API_BASE, DEFAULT_LANG, REQUEST_TIMEOUT_MS } from '../config.js';

/**
 * Send a voice command to the backend for intent classification.
 * @param {string} text - The recognized speech text.
 * @param {string} [lang='en-IN'] - Language code.
 * @returns {Promise<{intent: string, params: object, reply?: string}>}
 *   On failure returns { intent: 'UNKNOWN', params: {}, reply: 'Sorry, I could not understand.' }
 */
export async function interpretCommand(text, lang = DEFAULT_LANG) {
  const fallback = { intent: 'UNKNOWN', params: {}, reply: 'Sorry, I could not understand.' };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const res = await fetch(`${API_BASE}/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    bus.emit(APP_ERROR, {
      source: 'ai',
      message: `Intent request failed: ${err.message}`,
      recoverable: true,
    });
    return fallback;
  }
}

/**
 * Send an image to the backend for AI-powered analysis.
 * @param {Object} params
 * @param {string} params.imageBase64 - Base64-encoded image (data URL).
 * @param {string} params.intent - The classified intent string.
 * @param {Object} [params.params={}] - Additional parameters from intent parsing.
 * @param {string} [params.lang='en-IN'] - Language code.
 * @returns {Promise<{speech: string, items: Array, hazard: string, confidence: string}>}
 *   On failure returns { speech: 'Analysis unavailable.', items: [], hazard: 'none', confidence: 'low' }
 */
export async function analyzeImage({ imageBase64, intent, params = {}, lang = DEFAULT_LANG }) {
  const fallback = { speech: 'Analysis unavailable.', items: [], hazard: 'none', confidence: 'low' };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const res = await fetch(`${API_BASE}/vision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, intent, params, lang }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    bus.emit(APP_ERROR, {
      source: 'ai',
      message: `Vision request failed: ${err.message}`,
      recoverable: true,
    });
    return fallback;
  }
}
