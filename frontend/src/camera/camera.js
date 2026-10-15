/**
 * DigitalVision — Camera Module
 *
 * Owner: Member 2
 * See docs/CONTRACT.md §3.2 and §8 for contract requirements.
 *
 * Handles camera lifecycle, stream binding to an internal reusable video element,
 * and scaled frame capture for vision inference.
 */

import { bus } from '../core/eventBus.js';
import { APP_ERROR } from '../core/events.js';

/** Maximum dimension (width or height) allowed for captured frames. */
const MAX_FRAME_DIMENSION = 768;

/** Default JPEG compression quality. */
const JPEG_QUALITY = 0.7;

/** @type {MediaStream|null} */
let activeStream = null;

/** @type {HTMLVideoElement|null} */
let hiddenVideoElement = null;

/** @type {HTMLCanvasElement|null} */
let offscreenCanvas = null;

/** @type {Set<Function>} */
const stopListeners = new Set();

/**
 * Register a callback to be invoked whenever the camera is stopped.
 * @param {Function} callback
 * @returns {() => void} Unsubscribe function.
 */
export function onCameraStop(callback) {
  if (typeof callback === 'function') {
    stopListeners.add(callback);
    return () => stopListeners.delete(callback);
  }
  return () => {};
}

/**
 * Returns or creates the singleton hidden video element.
 * Configured with playsinline, muted, and autoplay to satisfy mobile browser autoplay policies.
 * @returns {HTMLVideoElement|null}
 */
export function getOrCreateHiddenVideo() {
  if (typeof document === 'undefined') {
    return null;
  }

  if (!hiddenVideoElement || !document.body.contains(hiddenVideoElement)) {
    const existing = document.getElementById('digitalvision-hidden-video');
    if (existing && existing instanceof HTMLVideoElement) {
      hiddenVideoElement = existing;
    } else {
      const video = document.createElement('video');
      video.id = 'digitalvision-hidden-video';
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.muted = true;
      video.defaultMuted = true;
      video.autoplay = true;
      // Position offscreen to prevent UI interference while remaining active in DOM
      video.style.position = 'fixed';
      video.style.top = '-9999px';
      video.style.left = '-9999px';
      video.style.width = '1px';
      video.style.height = '1px';
      video.style.opacity = '0';
      video.style.pointerEvents = 'none';
      video.setAttribute('aria-hidden', 'true');

      if (document.body) {
        document.body.appendChild(video);
      }
      hiddenVideoElement = video;
    }
  }

  return hiddenVideoElement;
}

/**
 * Returns or creates the reusable offscreen canvas element.
 * @returns {HTMLCanvasElement|null}
 */
function getOrCreateOffscreenCanvas() {
  if (typeof document === 'undefined') {
    return null;
  }
  if (!offscreenCanvas) {
    offscreenCanvas = document.createElement('canvas');
  }
  return offscreenCanvas;
}

/**
 * Wait until the video element has loaded metadata and has non-zero frame dimensions.
 * @param {HTMLVideoElement} video
 * @param {number} [timeoutMs=3500]
 * @returns {Promise<boolean>}
 */
function waitForVideoReady(video, timeoutMs = 3500) {
  return new Promise((resolve) => {
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      resolve(true);
      return;
    }

    let timer = null;
    const cleanup = () => {
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('playing', onReady);
      if (timer) clearTimeout(timer);
    };

    const onReady = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        cleanup();
        resolve(true);
      }
    };

    video.addEventListener('loadeddata', onReady);
    video.addEventListener('canplay', onReady);
    video.addEventListener('playing', onReady);

    timer = setTimeout(() => {
      cleanup();
      resolve(video.videoWidth > 0 && video.videoHeight > 0);
    }, timeoutMs);
  });
}

/**
 * Check if the camera is currently streaming with active live tracks.
 * @returns {boolean}
 */
export function isCameraActive() {
  if (!activeStream) {
    return false;
  }
  const tracks = activeStream.getVideoTracks();
  return tracks.length > 0 && tracks.some((track) => track.readyState === 'live');
}

/**
 * Get the current active MediaStream, if any.
 * Exposed for UI preview components (e.g. video preview elements).
 * @returns {MediaStream|null}
 */
export function getVideoStream() {
  return isCameraActive() ? activeStream : null;
}

/**
 * Get the internal hidden video element.
 * @returns {HTMLVideoElement|null}
 */
export function getVideoElement() {
  return hiddenVideoElement;
}

/**
 * Request camera access and start the video stream.
 * Prefers the rear camera ('environment') at ~1280x720 on supported devices.
 * Falls back to other available cameras if preferred constraints fail.
 * Resolves true on success, false on expected failures (without throwing).
 *
 * @param {Object} [options]
 * @param {string} [options.facingMode='environment'] - Preferred facing mode.
 * @returns {Promise<boolean>} True if camera started successfully, false otherwise.
 */
export async function startCamera({ facingMode = 'environment' } = {}) {
  // Check for mediaDevices browser support
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  ) {
    bus.emit(APP_ERROR, {
      source: 'camera',
      message: 'Camera API (navigator.mediaDevices.getUserMedia) is not supported in this browser.',
      recoverable: false,
    });
    return false;
  }

  // If already active with working tracks, return immediately
  if (isCameraActive() && hiddenVideoElement && hiddenVideoElement.readyState >= 2) {
    return true;
  }

  // Stop any lingering previous stream before starting a new one
  stopCamera();

  let stream = null;

  // Primary constraints: preferred facing mode and approximately 1280x720
  const primaryConstraints = {
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  };

  try {
    stream = await navigator.mediaDevices.getUserMedia(primaryConstraints);
  } catch (err) {
    // Check for user rejection or hardware absence - do not attempt fallback
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      bus.emit(APP_ERROR, {
        source: 'camera',
        message: 'Camera permission denied. Please grant camera access in browser settings.',
        recoverable: false,
      });
      return false;
    }

    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      bus.emit(APP_ERROR, {
        source: 'camera',
        message: 'No camera hardware found on this device.',
        recoverable: false,
      });
      return false;
    }

    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      bus.emit(APP_ERROR, {
        source: 'camera',
        message: 'Camera is currently in use by another application or blocked by the operating system.',
        recoverable: true,
      });
      return false;
    }

    if (err.name === 'SecurityError') {
      bus.emit(APP_ERROR, {
        source: 'camera',
        message: 'Camera access requires a secure context (HTTPS or localhost).',
        recoverable: false,
      });
      return false;
    }

    // Constraint error or hardware mismatch: fall back to any available camera
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
    } catch (fallbackErr) {
      bus.emit(APP_ERROR, {
        source: 'camera',
        message: `Failed to start camera: ${fallbackErr.message || fallbackErr.name || 'Unknown error'}`,
        recoverable: true,
      });
      return false;
    }
  }

  if (!stream) {
    bus.emit(APP_ERROR, {
      source: 'camera',
      message: 'Failed to acquire camera stream.',
      recoverable: true,
    });
    return false;
  }

  activeStream = stream;

  // Listen for unexpected track termination (e.g. user revoked permission or disconnected camera)
  stream.getVideoTracks().forEach((track) => {
    track.addEventListener('ended', () => {
      if (activeStream === stream) {
        stopCamera();
        bus.emit(APP_ERROR, {
          source: 'camera',
          message: 'Camera stream disconnected or track ended.',
          recoverable: true,
        });
      }
    });
  });

  // Attach to hidden video element
  const video = getOrCreateHiddenVideo();
  if (!video) {
    stopCamera();
    bus.emit(APP_ERROR, {
      source: 'camera',
      message: 'Failed to create internal video element.',
      recoverable: false,
    });
    return false;
  }

  video.srcObject = stream;

  try {
    await video.play();
  } catch {
    // Autoplay may be restricted; playsinline + muted allows it in compliant browsers
  }

  // Wait until video has dimensions and data ready
  await waitForVideoReady(video);

  return true;
}

/**
 * Stop the camera and release all media tracks and DOM resources.
 * @returns {void}
 */
export function stopCamera() {
  if (activeStream) {
    activeStream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // Ignore errors during track teardown
      }
    });
    activeStream = null;
  }

  if (hiddenVideoElement) {
    try {
      hiddenVideoElement.pause();
      hiddenVideoElement.srcObject = null;
    } catch {
      // Ignore errors during video pause
    }
  }

  // Notify registered teardown listeners (e.g. continuous monitoring)
  for (const listener of stopListeners) {
    try {
      listener();
    } catch {
      // Prevent listener failures from blocking teardown
    }
  }
}

/**
 * Capture the current camera frame through an offscreen canvas.
 * - Scales the longest side to at most 768 pixels while preserving the aspect ratio.
 * - Encodes as JPEG at quality 0.7.
 * - Returns base64 without the "data:" prefix.
 * - Returns null if the camera is inactive, the video is not ready, or capture fails.
 * - Does NOT save, upload, or log images.
 *
 * @returns {string|null} Raw base64 JPEG string without data: prefix, or null on failure.
 */
export function captureFrame() {
  if (!isCameraActive() || !hiddenVideoElement) {
    return null;
  }

  // Video must have valid frames ready
  if (hiddenVideoElement.readyState < 2) {
    return null;
  }

  const srcWidth = hiddenVideoElement.videoWidth;
  const srcHeight = hiddenVideoElement.videoHeight;

  if (!srcWidth || !srcHeight) {
    return null;
  }

  // Calculate scaled dimensions: longest side capped at MAX_FRAME_DIMENSION
  let targetWidth = srcWidth;
  let targetHeight = srcHeight;
  const longestSide = Math.max(srcWidth, srcHeight);

  if (longestSide > MAX_FRAME_DIMENSION) {
    const scale = MAX_FRAME_DIMENSION / longestSide;
    targetWidth = Math.round(srcWidth * scale);
    targetHeight = Math.round(srcHeight * scale);
  }

  try {
    const canvas = getOrCreateOffscreenCanvas();
    if (!canvas) {
      return null;
    }

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      return null;
    }

    ctx.drawImage(hiddenVideoElement, 0, 0, targetWidth, targetHeight);

    // Encode as JPEG at quality 0.7
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);

    // Strip "data:image/jpeg;base64," prefix to return raw base64 data
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex === -1) {
      return null;
    }

    return dataUrl.slice(commaIndex + 1);
  } catch {
    // Capture failure: return null safely without throwing
    return null;
  }
}
