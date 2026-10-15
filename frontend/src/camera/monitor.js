/**
 * DigitalVision — Camera Continuous Monitoring & Hazard Vibration
 *
 * Owner: Member 2
 * See docs/CONTRACT.md §3.2, §6, and §10 for specifications.
 *
 * Provides periodic frame capture with async backpressure, tab visibility handling,
 * and restrained haptic vibration feedback for classified hazard levels.
 *
 * NOTE: DigitalVision is an assistive aid, NOT a safety or collision-prevention device.
 * Standard monocular camera images cannot provide reliable proximity or depth detection.
 */

import { bus } from '../core/eventBus.js';
import { APP_ERROR, UI_CAPTION } from '../core/events.js';
import { isCameraActive, captureFrame, onCameraStop } from './camera.js';

// Automatically cease monitoring when the camera is stopped
onCameraStop(() => {
  stopMonitoring();
});

/** @type {number|null} */
let monitorIntervalId = null;

/** Flag indicating whether monitoring has been started. */
let isMonitoring = false;

/** Flag indicating whether the current frame callback is still executing (backpressure guard). */
let isProcessingFrame = false;

/** Active frame handler callback. */
let activeOnFrameCallback = null;

/** Event listener reference for visibility changes. */
let visibilityChangeHandler = null;

/**
 * Handle tab visibility transitions.
 * When tab is hidden/backgrounded, browser timers are throttled and video decoding is suspended.
 * Monitoring pauses capturing and alerts the user rather than claiming normal operation.
 */
function handleVisibilityChange() {
  if (typeof document === 'undefined') return;

  if (document.hidden) {
    bus.emit(UI_CAPTION, {
      text: 'Monitoring paused (tab backgrounded).',
      type: 'warning',
    });
  } else {
    bus.emit(UI_CAPTION, {
      text: 'Monitoring resumed.',
      type: 'info',
    });
  }
}

/**
 * Check whether continuous monitoring is actively capturing frames.
 * Returns false if monitoring was stopped OR if the browser tab is currently hidden.
 * @returns {boolean}
 */
export function isMonitoringActive() {
  if (!isMonitoring) {
    return false;
  }
  if (typeof document !== 'undefined' && document.hidden) {
    return false;
  }
  return true;
}

/**
 * Start periodic frame capture for continuous environmental monitoring.
 *
 * Guarantees:
 * - Never starts duplicate monitoring loops.
 * - Skips scheduled captures if the previous onFrame callback is still running.
 * - Suspends captures when the tab is backgrounded.
 *
 * @param {(base64: string) => Promise<void>} onFrame - Async callback receiving the captured JPEG base64 string.
 * @param {number} [intervalMs=4000] - Interval between captures in milliseconds (default 4000ms).
 * @returns {void}
 */
export function startMonitoring(onFrame, intervalMs = 4000) {
  if (typeof onFrame !== 'function') {
    bus.emit(APP_ERROR, {
      source: 'camera:monitor',
      message: 'startMonitoring requires a valid callback function.',
      recoverable: true,
    });
    return;
  }

  // Never start duplicate monitoring loops
  if (isMonitoring) {
    console.warn('[DigitalVision:monitor] startMonitoring called while already active. Ignoring duplicate request.');
    return;
  }

  isMonitoring = true;
  isProcessingFrame = false;
  activeOnFrameCallback = onFrame;

  // Listen for tab visibility changes
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    visibilityChangeHandler = handleVisibilityChange;
    document.addEventListener('visibilitychange', visibilityChangeHandler);
  }

  const effectiveInterval = Math.max(100, Number(intervalMs) || 4000);

  /**
   * Single tick of the monitoring scheduler.
   */
  const tick = async () => {
    if (!isMonitoring) {
      return;
    }

    // If tab is hidden or backgrounded, skip frame capture and do not claim normal functioning
    if (typeof document !== 'undefined' && document.hidden) {
      return;
    }

    // Skip scheduled capture if previous callback is still running
    if (isProcessingFrame) {
      return;
    }

    // Camera must be actively streaming
    if (!isCameraActive()) {
      return;
    }

    isProcessingFrame = true;

    try {
      const frameBase64 = captureFrame();
      if (frameBase64 && activeOnFrameCallback && isMonitoring) {
        await activeOnFrameCallback(frameBase64);
      }
    } catch (err) {
      bus.emit(APP_ERROR, {
        source: 'camera:monitor',
        message: `Error during monitoring frame analysis: ${err.message || 'Unknown error'}`,
        recoverable: true,
      });
    } finally {
      isProcessingFrame = false;
    }
  };

  monitorIntervalId = window.setInterval(tick, effectiveInterval);
}

/**
 * Stop periodic frame capture and release all monitoring resources.
 * @returns {void}
 */
export function stopMonitoring() {
  if (monitorIntervalId !== null) {
    clearInterval(monitorIntervalId);
    monitorIntervalId = null;
  }

  if (visibilityChangeHandler && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', visibilityChangeHandler);
    visibilityChangeHandler = null;
  }

  isMonitoring = false;
  isProcessingFrame = false;
  activeOnFrameCallback = null;
}

/**
 * Trigger device haptic vibration based on environmental hazard severity.
 *
 * Patterns:
 * - 'none': Cancels active vibration.
 * - 'caution': Subtle double pulse [120ms, 80ms, 120ms].
 * - 'danger': Urgent triple pulse [250ms, 100ms, 250ms, 100ms, 250ms].
 * - Unsupported devices: Safe no-op without throwing.
 *
 * IMPORTANT: Ordinary camera images cannot infer exact distance or guarantee safety.
 * This feedback serves only as a qualitative assistive signal.
 *
 * @param {'none'|'caution'|'danger'|string} hazard - Hazard severity level.
 * @returns {void}
 */
export function vibrateForHazard(hazard) {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.vibrate !== 'function'
  ) {
    // Vibration API not supported on this device/browser; silent no-op
    return;
  }

  try {
    switch (hazard) {
      case 'none':
        navigator.vibrate(0);
        break;
      case 'caution':
        navigator.vibrate([120, 80, 120]);
        break;
      case 'danger':
        navigator.vibrate([250, 100, 250, 100, 250]);
        break;
      default:
        navigator.vibrate(0);
        break;
    }
  } catch {
    // User activation policy or hardware restriction
  }
}
