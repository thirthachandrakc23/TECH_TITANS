/**
 * DigitalVision — Audio Service (STUB)
 *
 * Owner: Member 4
 * See docs/CONTRACT.md §3.1 for the full interface contract.
 *
 * This file provides the agreed function signatures with JSDoc.
 * Member 4 replaces the stub bodies with real implementations.
 */

import { bus } from '../core/eventBus.js';
import { APP_ERROR, VOICE_STATE } from '../core/events.js';
// Also import when implementing: TTS_START, TTS_END from '../core/events.js'

/**
 * Start speech recognition. Emits voice:state and voice:transcript events.
 * @returns {Promise<void>}
 */
export async function startListening() {
  bus.emit(APP_ERROR, {
    source: 'audio',
    message: 'startListening() not implemented yet.',
    recoverable: true,
  });
}

/**
 * Stop speech recognition. Emits voice:state('idle').
 * @returns {Promise<void>}
 */
export async function stopListening() {
  bus.emit(VOICE_STATE, { state: 'idle' });
}

/**
 * Speak text aloud using the Web Speech API. Emits tts:start and tts:end.
 * @param {string} text - Text to speak.
 * @param {Object} [options]
 * @param {string} [options.lang='en-IN'] - Language / voice.
 * @param {number} [options.rate=1.0] - Speech rate (0.5–2.0).
 * @param {number} [options.pitch=1.0] - Speech pitch (0–2).
 * @returns {Promise<void>}
 */
export async function speak(_text, _options = {}) {
  bus.emit(APP_ERROR, {
    source: 'audio',
    message: 'speak() not implemented yet.',
    recoverable: true,
  });
}

/**
 * Cancel any ongoing speech synthesis.
 * @returns {void}
 */
export function stopSpeaking() {
  // TODO: Member 4 — speechSynthesis.cancel()
}

/**
 * Initialize waveform visualization on a canvas element.
 * @param {HTMLCanvasElement} canvasEl - The canvas to draw on.
 * @returns {void}
 */
export function initWaveform(_canvasEl) {
  // TODO: Member 4 — set up Web Audio analyser and canvas drawing
}

/**
 * Update the waveform visual state.
 * @param {'listening'|'speaking'|'idle'} state
 * @returns {void}
 */
export function setWaveformState(_state) {
  // TODO: Member 4 — change waveform rendering based on state
}
