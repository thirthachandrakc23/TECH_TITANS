# DigitalVision Service Layer Contract

> [!IMPORTANT]
> **DRAFT: Not implemented. This document proposes conventions for the future service layer. The Team Lead must finalize it before Stage 2 begins.**

---

## 1. Overview & Service Location

All service layer modules are located in:

```
frontend/src/services/
```

### Purpose of the Service Layer

The service layer encapsulates external browser APIs, hardware access, and future machine learning inference engines. UI components must never directly invoke raw browser APIs (e.g., `navigator.mediaDevices` or `window.speechSynthesis`) or ML runtimes. Instead, all interactions will pass through well-defined service functions.

> [!WARNING]
> **Proposal Notice:** Every interface, function signature, and error code specified in this document is a **PROPOSAL ONLY**. No service code is implemented at this stage. The Team Lead must review, adjust, and approve this contract before Stage 2 implementation commences.

---

## 2. Proposed Return Type Convention: "Never Throw"

To ensure predictable error handling and avoid unexpected crashes in the React UI layer, services follow a strict **"Never Throw"** convention.

### The Rule

1. Services wrap internal operations in `try / catch` blocks.
2. Services **never throw unhandled exceptions** or return rejected promises to callers.
3. Every asynchronous or fallible service function resolves to a standardized **Result Object**:
   - **On Success:** `{ ok: true, data: <payload> }`
   - **On Failure:** `{ ok: false, error: { code: string, message: string, recoverable: boolean } }`

### Code Example of the Convention

```javascript
/**
 * @template T
 * @typedef {{ ok: true, data: T }} SuccessResult
 */

/**
 * @typedef {{
 *   code: string,         // Machine-readable error identifier (e.g. 'PERMISSION_DENIED')
 *   message: string,      // User-friendly descriptive error message
 *   recoverable: boolean  // Indicates if user/system can retry without reloading
 * }} ServiceError
 */

/**
 * @template T
 * @typedef {{ ok: false, error: ServiceError }} FailureResult
 */

/**
 * @template T
 * @typedef {SuccessResult<T> | FailureResult<T>} ServiceResult
 */

// Example: How a future service method would follow this convention
async function exampleServiceMethod(parameter) {
  try {
    // Perform browser or ML operation
    const resultData = await someBrowserApi(parameter);
    return {
      ok: true,
      data: resultData
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'OPERATION_FAILED',
        message: err.message || 'An unexpected error occurred.',
        recoverable: true
      }
    };
  }
}

// Example: How a React component consumes the service safely
async function handleAction() {
  const result = await exampleServiceMethod('test');
  if (!result.ok) {
    console.error(`[${result.error.code}]: ${result.error.message}`);
    // Update accessible error state in UI
    return;
  }
  // Safely use result.data
  console.log('Success payload:', result.data);
}
```

---

## 3. Planned Services (Proposals Only - NOT IMPLEMENTED)

### 3.1. `cameraService`

- **Status:** **PLANNED — NOT IMPLEMENTED**
- **File Location (Target):** `frontend/src/services/cameraService.js`
- **Purpose:** Manage camera hardware access, permissions, video element stream binding, and teardown.

#### Proposed Function Signatures

##### `startCamera(videoElement, constraints)`
- **Inputs:**
  - `videoElement` (`HTMLVideoElement`): Reference to the DOM video element to attach the media stream.
  - `constraints` (`MediaStreamConstraints`, optional): Video constraints (e.g., `{ video: { facingMode: 'environment', width: { ideal: 1280 } } }`).
- **Output:** `Promise<ServiceResult<MediaStream>>`
  - Success payload (`data`): `MediaStream` instance currently playing.
  - Failure payload (`error`):
    - `CAMERA_PERMISSION_DENIED`: User denied permission to access camera.
    - `CAMERA_NOT_FOUND`: No video input device detected on system.
    - `CAMERA_IN_USE`: Camera hardware is occupied by another application.
    - `CAMERA_UNSUPPORTED`: Browser does not support `navigator.mediaDevices`.

##### `stopCamera(stream)`
- **Inputs:**
  - `stream` (`MediaStream`): The active stream whose tracks should be stopped.
- **Output:** `ServiceResult<null>`
  - Success payload (`data`): `null` (indicates tracks safely stopped).
  - Failure payload (`error`): `CAMERA_STOP_FAILED`.

##### `checkCameraPermission()`
- **Inputs:** None.
- **Output:** `Promise<ServiceResult<'granted' | 'denied' | 'prompt'>>`

---

### 3.2. `detectionService`

- **Status:** **PLANNED — NOT IMPLEMENTED**
- **File Location (Target):** `frontend/src/services/detectionService.js`
- **Purpose:** Load a browser-based pretrained machine learning model and run inference on video frames to detect objects.

#### Proposed Data Structures

```javascript
/**
 * @typedef {{
 *   label: string,             // Name of detected object (e.g., 'chair', 'person', 'bottle')
 *   confidence: number,        // Confidence score between 0.0 and 1.0
 *   bbox: [number, number, number, number] // Bounding box: [x, y, width, height] in pixels
 * }} DetectedObject
 */
```

#### Proposed Function Signatures

##### `loadModel()`
- **Inputs:** None (or optional model config string).
- **Output:** `Promise<ServiceResult<{ modelName: string, loaded: boolean }>>`
  - Success payload (`data`): Confirmation of model readiness.
  - Failure payload (`error`):
    - `MODEL_DOWNLOAD_FAILED`: Network failure while fetching model assets.
    - `MODEL_INIT_FAILED`: WebGL/WASM backend initialization failure.

##### `detectObjects(frameSource)`
- **Inputs:**
  - `frameSource` (`HTMLVideoElement | HTMLCanvasElement | ImageData`): Visual frame to inspect.
- **Output:** `Promise<ServiceResult<Array<DetectedObject>>>`
  - Success payload (`data`): Array of detected objects (e.g., `[{ label: 'door', confidence: 0.88, bbox: [120, 40, 200, 350] }]`).
  - Failure payload (`error`):
    - `MODEL_NOT_READY`: Detection attempted before `loadModel` completed.
    - `INVALID_FRAME_SOURCE`: Frame source is empty, null, or has zero dimensions.
    - `INFERENCE_ERROR`: Internal calculation error during model execution.

##### `disposeModel()`
- **Inputs:** None.
- **Output:** `ServiceResult<null>`: Releases WebGL / WASM memory resources.

---

### 3.3. `speechService`

- **Status:** **PLANNED — NOT IMPLEMENTED**
- **File Location (Target):** `frontend/src/services/speechService.js`
- **Purpose:** Provide accessible spoken feedback to the user via the browser's native Web Speech API (`window.speechSynthesis`).

#### Proposed Function Signatures

##### `speak(text, options)`
- **Inputs:**
  - `text` (`string`): The description or alert string to vocalize.
  - `options` (`object`, optional):
    - `rate` (`number`, default `1.0`): Speech playback speed (0.5 to 2.0).
    - `pitch` (`number`, default `1.0`): Voice pitch (0.0 to 2.0).
    - `interrupt` (`boolean`, default `false`): If `true`, cancels currently spoken queue before speaking.
- **Output:** `Promise<ServiceResult<{ spokenText: string }>>`
  - Success payload (`data`): `{ spokenText: string }` once queued/spoken.
  - Failure payload (`error`):
    - `SPEECH_UNSUPPORTED`: `window.speechSynthesis` is missing from the host browser.
    - `EMPTY_TEXT`: Text provided was blank or invalid.
    - `SPEECH_SYNTHESIS_FAILED`: Browser speech engine returned an error event.

##### `stopSpeech()`
- **Inputs:** None.
- **Output:** `ServiceResult<null>`: Cancels any active utterance immediately.

##### `getAvailableVoices()`
- **Inputs:** None.
- **Output:** `ServiceResult<Array<SpeechSynthesisVoice>>`: Returns list of system-installed voice profiles.

---

### 3.4. `ocrService` (Optional, Later Phase)

- **Status:** **PLANNED — NOT IMPLEMENTED (OPTIONAL)**
- **File Location (Target):** `frontend/src/services/ocrService.js`
- **Purpose:** Read alphanumeric text from camera captures (e.g., room numbers, signs, medication labels) using client-side OCR.

#### Proposed Function Signatures

##### `extractText(imageSource)`
- **Inputs:**
  - `imageSource` (`HTMLCanvasElement | ImageData | Blob`): Cropped or full frame image containing text.
- **Output:** `Promise<ServiceResult<{ text: string, confidence: number }>>`
  - Success payload (`data`): `{ text: string, confidence: number }`.
  - Failure payload (`error`):
    - `OCR_ENGINE_UNAVAILABLE`: In-browser OCR runtime could not be loaded.
    - `NO_TEXT_FOUND`: Image processed but no legible text was recognized.
    - `OCR_PROCESSING_FAILED`: Error during optical character extraction.

---

## 4. Summary of Service Error Codes (Proposed)

| Service | Proposed Error Code | Recoverable? | Recommended UI Action |
| :--- | :--- | :--- | :--- |
| `cameraService` | `CAMERA_PERMISSION_DENIED` | No | Prompt user to grant permission via browser address bar. |
| `cameraService` | `CAMERA_NOT_FOUND` | No | Announce that no camera was found on the device. |
| `cameraService` | `CAMERA_IN_USE` | Yes | Inform user another app is using the camera and retry. |
| `detectionService` | `MODEL_DOWNLOAD_FAILED` | Yes | Provide retry button with accessible status indicator. |
| `detectionService` | `MODEL_NOT_READY` | Yes | Wait for initial load to finish before triggering frames. |
| `detectionService` | `INFERENCE_ERROR` | Yes | Skip the current frame and retry the next frame cycle. |
| `speechService` | `SPEECH_UNSUPPORTED` | No | Fallback to visual-only screen reader announcements (ARIA live regions). |
| `speechService` | `SPEECH_SYNTHESIS_FAILED` | Yes | Attempt fallback voice or queue reset. |
| `ocrService` | `OCR_ENGINE_UNAVAILABLE` | Yes | Retry initialization or notify user OCR is offline. |

---

## 5. Next Steps for Team Lead

Before moving to **Stage 2 (Service Layer Implementation)**:
1. Review proposed parameter names and result types.
2. Confirm error code conventions and whether additional error metadata is needed.
3. Decide if `ocrService` is included in the minimum viable hackathon prototype or deferred to post-hackathon.
4. Formalize and mark this document as **ACCEPTED**.
