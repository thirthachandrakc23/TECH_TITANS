/**
 * DigitalVision — Book & Document Reader Service
 *
 * Provides free, offline, in-browser optical character recognition (OCR)
 * for reading printed books, documents, newspapers, and signs.
 * Powered by Tesseract.js.
 */

import { createWorker } from 'tesseract.js';

let ocrWorker = null;
let isWorkerInitializing = false;
let isWorkerReady = false;

/**
 * Lazily initialize and cache the Tesseract OCR worker.
 * @returns {Promise<any>}
 */
export async function getOCRWorker() {
  if (isWorkerReady && ocrWorker) {
    return ocrWorker;
  }

  if (isWorkerInitializing) {
    // Wait until initialization resolves
    while (isWorkerInitializing) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return ocrWorker;
  }

  isWorkerInitializing = true;
  try {
    const worker = await createWorker('eng');
    ocrWorker = worker;
    isWorkerReady = true;
    return ocrWorker;
  } catch (err) {
    console.warn('[DigitalVision OCR] Worker init fallback notice:', err);
    throw err;
  } finally {
    isWorkerInitializing = false;
  }
}

/**
 * Preprocess a video frame onto an offscreen canvas to optimize OCR accuracy:
 * - High resolution crop of the book page area
 * - Grayscale conversion
 * - High contrast stretch & binarization threshold
 *
 * @param {HTMLVideoElement} videoElement
 * @returns {HTMLCanvasElement|null}
 */
export function preprocessBookFrame(videoElement) {
  if (!videoElement || videoElement.videoWidth === 0) return null;

  const srcW = videoElement.videoWidth;
  const srcH = videoElement.videoHeight;

  const canvas = document.createElement('canvas');
  canvas.width = Math.min(1600, srcW);
  canvas.height = Math.min(1200, srcH);

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // Draw scaled video frame
  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

  try {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    // Fast luminance calculation & contrast boost
    for (let i = 0; i < data.length; i += 4) {
      // Standard perceptual luminance
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

      // Contrast stretch: push dark text darker, bright page paper lighter
      const boosted = gray < 135 ? Math.max(0, gray * 0.7) : Math.min(255, gray * 1.25);

      data[i] = boosted;
      data[i + 1] = boosted;
      data[i + 2] = boosted;
    }

    ctx.putImageData(imgData, 0, 0);
  } catch {
    // Fall back to raw canvas if ImageData is restricted
  }

  return canvas;
}

/**
 * Clean raw OCR text output into natural readable speech text.
 * Strips isolated artifacts, handles hyphens at line breaks, collapses whitespace.
 *
 * @param {string} raw
 * @returns {string}
 */
export function cleanExtractedBookText(raw) {
  if (!raw || typeof raw !== 'string') return '';

  return raw
    // Join hyphenated line breaks e.g. "connec- \n tion" -> "connection"
    .replace(/(\w+)-\s*\n+\s*(\w+)/g, '$1$2')
    // Replace newlines with spaces
    .replace(/\n+/g, ' ')
    // Remove isolated single punctuation or stray noise characters
    .replace(/\s+[^a-zA-Z0-9\s.,?!'"]+\s+/g, ' ')
    // Normalize spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Read the current book or document page in view using in-browser free OCR.
 *
 * @param {HTMLVideoElement} videoElement
 * @returns {Promise<{ success: boolean, text: string, confidence: number }>}
 */
export async function readBookPage(videoElement) {
  if (!videoElement || videoElement.readyState < 2) {
    return {
      success: false,
      text: 'Camera is not ready. Please hold the book steady in front of the lens.',
      confidence: 0,
    };
  }

  const canvas = preprocessBookFrame(videoElement);
  if (!canvas) {
    return {
      success: false,
      text: 'Could not capture page image from camera.',
      confidence: 0,
    };
  }

  try {
    const worker = await getOCRWorker();
    const result = await worker.recognize(canvas);
    const rawText = result?.data?.text || '';
    const confidence = result?.data?.confidence || 0;

    const cleaned = cleanExtractedBookText(rawText);

    // If cleaned text contains at least 3 recognizable words
    const wordCount = cleaned.split(/\s+/).filter((w) => w.length > 1).length;

    if (wordCount >= 3 && confidence >= 25) {
      return {
        success: true,
        text: cleaned,
        confidence: Math.round(confidence),
      };
    }

    return {
      success: false,
      text: 'No clear text detected. Please bring the book closer, keep the page flat, and hold steady.',
      confidence: Math.round(confidence),
    };
  } catch (err) {
    console.warn('[DigitalVision OCR] Recognition error:', err);
    return {
      success: false,
      text: 'Unable to read the page at this moment. Please adjust lighting and try again.',
      confidence: 0,
    };
  }
}
