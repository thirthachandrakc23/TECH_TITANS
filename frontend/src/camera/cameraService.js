/**
 * DigitalVision — Camera Service
 *
 * Owner: Member 2
 * See docs/CONTRACT.md §3.2 for the interface specification.
 *
 * Unifies camera lifecycle, frame capture, periodic monitoring, and hazard vibration.
 */

import {
  startCamera as baseStartCamera,
  stopCamera as baseStopCamera,
  isCameraActive,
  captureFrame,
  getVideoStream,
  getVideoElement,
} from './camera.js';

import {
  startMonitoring,
  stopMonitoring,
  isMonitoringActive,
  vibrateForHazard,
} from './monitor.js';

/**
 * Request camera access and start the video stream.
 * Prefers the rear camera ('environment') at ~1280x720 when available,
 * falling back gracefully to any available camera.
 *
 * @param {Object} [options]
 * @param {string} [options.facingMode='environment'] - Camera facing mode ('environment' | 'user').
 * @param {number} [options.width=1280] - Preferred width.
 * @param {number} [options.height=720] - Preferred height.
 * @returns {Promise<boolean>} True if camera started successfully, false on expected failure.
 */
export async function startCamera(options = {}) {
  return baseStartCamera(options);
}

/**
 * Stop the camera stream, release all media tracks, and halt active monitoring.
 * @returns {void}
 */
export function stopCamera() {
  baseStopCamera();
}

export {
  isCameraActive,
  captureFrame,
  getVideoStream,
  getVideoElement,
  startMonitoring,
  stopMonitoring,
  isMonitoringActive,
  vibrateForHazard,
};
