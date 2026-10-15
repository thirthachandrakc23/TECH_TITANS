/**
 * DigitalVision — Camera Service (STUB)
 *
 * Owner: Member 2
 * See docs/CONTRACT.md §3.2 for the full interface contract.
 *
 * This file provides the agreed function signatures with JSDoc.
 * Member 2 replaces the stub bodies with real implementations.
 */

import { bus } from '../core/eventBus.js';
import { APP_ERROR } from '../core/events.js';

/**
 * Request camera access and start the video stream.
 * @param {Object} [options]
 * @param {string} [options.facingMode='environment'] - Camera facing mode.
 * @param {number} [options.width=640] - Preferred width.
 * @param {number} [options.height=480] - Preferred height.
 * @returns {Promise<MediaStream|null>} The camera stream, or null on failure.
 */
export async function startCamera(_options = {}) {
  bus.emit(APP_ERROR, {
    source: 'camera',
    message: 'startCamera() not implemented yet.',
    recoverable: true,
  });
  return null;
}

/**
 * Stop the camera and release all resources.
 * @returns {void}
 */
export function stopCamera() {
  // TODO: Member 2 — stop tracks, release stream
}

/**
 * Check whether the camera is currently streaming.
 * @returns {boolean}
 */
export function isCameraActive() {
  return false;
}

/**
 * Capture the current video frame as a base64 JPEG data URL.
 * @returns {string|null} Base64 data URL, or null if camera is not active.
 */
export function captureFrame() {
  return null;
}

/**
 * Start periodic frame capture for monitoring mode.
 * Should skip a capture if the previous onFrame callback is still running.
 * @param {(base64: string) => Promise<void>} onFrame - Async callback for each frame.
 * @param {number} [intervalMs=3000] - Milliseconds between captures.
 * @returns {void}
 */
export function startMonitoring(_onFrame, _intervalMs = 3000) {
  // TODO: Member 2 — setInterval, skip if previous still running
}

/**
 * Stop periodic frame capture.
 * @returns {void}
 */
export function stopMonitoring() {
  // TODO: Member 2 — clearInterval
}

/**
 * Trigger device vibration based on hazard level.
 * @param {'none'|'caution'|'danger'} hazard
 * @returns {void}
 */
export function vibrateForHazard(_hazard) {
  // TODO: Member 2 — navigator.vibrate with pattern based on hazard
}
