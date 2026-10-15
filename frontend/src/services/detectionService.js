/**
 * DigitalVision — Object Detection Service
 *
 * Real browser-based object detection using TensorFlow.js and COCO-SSD.
 * Uses dynamic importing for optimal initial page-load performance,
 * running inference locally on device without external network transmission of frames.
 */

/** @type {any} */
let loadedModel = null;

/** @type {'idle'|'loading'|'ready'|'error'} */
let modelStatus = 'idle';

/** @type {string|null} */
let modelError = null;

/**
 * Determine relative horizontal location of detected object within video frame.
 * @param {[number, number, number, number]} bbox - [x, y, width, height]
 * @param {number} frameWidth
 * @returns {'left'|'center'|'right'}
 */
export function computeRelativeLocation(bbox, frameWidth) {
  if (!bbox || !frameWidth) return 'center';
  const [x, , width] = bbox;
  const centerX = x + width / 2;
  const oneThird = frameWidth / 3;

  if (centerX < oneThird) {
    return 'left';
  } else if (centerX > oneThird * 2) {
    return 'right';
  }
  return 'center';
}

/**
 * Check if the COCO-SSD model is loaded and ready for inference.
 * @returns {boolean}
 */
export function isModelReady() {
  return modelStatus === 'ready' && loadedModel !== null;
}

/**
 * Get current loading state and any error message.
 * @returns {{ status: 'idle'|'loading'|'ready'|'error', error: string|null }}
 */
export function getModelStatus() {
  return { status: modelStatus, error: modelError };
}

/**
 * Dynamically loads TensorFlow.js and the pretrained MobileNetV2 COCO-SSD model.
 * Code-split to ensure lightning-fast initial load for the accessibility UI.
 *
 * @returns {Promise<any>}
 */
export async function loadDetectionModel() {
  if (loadedModel && modelStatus === 'ready') {
    return loadedModel;
  }

  modelStatus = 'loading';
  modelError = null;

  try {
    // Dynamic import to keep initial bundle small
    const [tf, cocoSsd] = await Promise.all([
      import('@tensorflow/tfjs'),
      import('@tensorflow-models/coco-ssd'),
    ]);

    // Ensure backend is ready
    await tf.ready();

    // Load lightweight MobileNetV2 COCO-SSD model
    const model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
    loadedModel = model;
    modelStatus = 'ready';
    return model;
  } catch (err) {
    modelStatus = 'error';
    modelError = err.message || 'Failed to download or initialize object detection model.';
    throw err;
  }
}

/**
 * Run object detection on an active HTMLVideoElement.
 *
 * @param {HTMLVideoElement} videoElement
 * @param {number} [minConfidence=0.45]
 * @returns {Promise<Array<{ label: string, score: number, bbox: [number, number, number, number], location: 'left'|'center'|'right' }>>}
 */
export async function detectObjects(videoElement, minConfidence = 0.45) {
  if (!loadedModel || modelStatus !== 'ready') {
    return [];
  }

  if (
    !videoElement ||
    videoElement.readyState < 2 ||
    !videoElement.videoWidth ||
    !videoElement.videoHeight
  ) {
    return [];
  }

  try {
    const rawPredictions = await loadedModel.detect(videoElement, 8, minConfidence);
    const frameWidth = videoElement.videoWidth;

    return rawPredictions.map((pred) => ({
      label: pred.class,
      score: Math.round(pred.score * 100),
      bbox: pred.bbox,
      location: computeRelativeLocation(pred.bbox, frameWidth),
    }));
  } catch (err) {
    console.error('[detectionService] Detection error:', err);
    return [];
  }
}

/**
 * Release model memory resources if necessary.
 */
export function disposeDetectionModel() {
  loadedModel = null;
  modelStatus = 'idle';
  modelError = null;
}
