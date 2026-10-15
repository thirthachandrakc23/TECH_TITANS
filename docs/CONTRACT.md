# DigitalVision — Team Contract

> **This document is the single source of truth for all team members.**
> Do not rename events, exports, or API fields after teammates start implementation.
> Last updated: 2026-10-15 (Stage 2 foundation).

---

## 1. Module Ownership

| Role | Owner | Owned Files | Notes |
|---|---|---|---|
| **Team Lead** | Member 1 | `src/main.jsx`, `src/core/`, `src/ui/`, `src/config.js`, root configs, `docs/CONTRACT.md` | Integration, deployment, conflict resolution |
| **Camera** | Member 2 | `src/camera/`, `dev/test-camera.html` | Camera access, frame capture, monitoring |
| **AI** | Member 3 | `backend/`, `src/ai/`, `dev/test-ai.html` | Gemini proxy, intent parsing, image analysis |
| **Voice / Audio** | Member 4 | `src/audio/`, `dev/test-audio.html` | Speech recognition, TTS, waveform |

> **Rule:** Do not edit another member's owned files without coordination.
> All `src/` paths are relative to `frontend/src/`.

---

## 2. Event Bus

### Location
`frontend/src/core/eventBus.js`

### API
```js
import { bus } from './core/eventBus.js';

bus.on(eventName, callback);    // Subscribe
bus.off(eventName, callback);   // Unsubscribe
bus.emit(eventName, payload);   // Publish
```

### Events

| Event | Payload | Emitted by | Meaning |
|---|---|---|---|
| `app:start` | `{ lang: string }` | Team Lead (orchestrator) | App initialized, modules should start |
| `mic:stream` | `{ stream: MediaStream }` | Audio module | Microphone stream obtained |
| `voice:state` | `{ state: 'listening' \| 'processing' \| 'idle' }` | Audio module | Voice recognition state changed |
| `voice:transcript` | `{ text: string, isFinal: boolean, lang: string }` | Audio module | Speech recognized |
| `tts:start` | `{ text: string }` | Audio module | Text-to-speech started |
| `tts:end` | `{}` | Audio module | Text-to-speech finished |
| `ui:caption` | `{ text: string, type: 'info' \| 'success' \| 'warning' \| 'error' }` | Any module | Update the caption/status display |
| `app:error` | `{ source: string, message: string, recoverable: boolean }` | Any module | An error occurred |

> **Frozen:** Do not rename events or change payload shapes after this contract is accepted.

---

## 3. Module Interfaces

All async functions return Promises. On expected errors, they return documented fallback values and emit `app:error`. They do NOT throw for expected failures.

### 3.1 Audio Module (`src/audio/audioService.js`)

```js
/** Start speech recognition. Emits voice:state, voice:transcript. */
async function startListening()  // Returns: void

/** Stop speech recognition. Emits voice:state('idle'). */
async function stopListening()   // Returns: void

/** Speak text aloud. Emits tts:start, tts:end. */
async function speak(text, options = {})  // options: { lang, rate, pitch }
// Returns: void

/** Cancel any ongoing speech. */
function stopSpeaking()  // Returns: void

/** Initialize waveform visualization on a canvas element. */
function initWaveform(canvasEl)  // Returns: void

/** Update waveform visual state. */
function setWaveformState(state)  // state: 'listening' | 'speaking' | 'idle'
// Returns: void
```

### 3.2 Camera Module (`src/camera/cameraService.js`)

```js
/** Request camera access and start video stream. */
async function startCamera(options = {})  // options: { facingMode, width, height }
// Returns: MediaStream | null (null on failure, emits app:error)

/** Stop camera and release resources. */
function stopCamera()  // Returns: void

/** Check if camera is currently streaming. */
function isCameraActive()  // Returns: boolean

/** Capture current frame as base64 JPEG. */
function captureFrame()  // Returns: string | null (base64 data URL, null if no camera)

/** Start periodic frame capture. Skips if previous analysis still running. */
function startMonitoring(onFrame, intervalMs = 3000)
// onFrame: async (base64) => void
// Returns: void

/** Stop periodic frame capture. */
function stopMonitoring()  // Returns: void

/** Trigger device vibration for hazard level. */
function vibrateForHazard(hazard)  // hazard: 'none' | 'caution' | 'danger'
// Returns: void
```

### 3.3 AI Module (`src/ai/aiService.js`)

```js
/** Send text to backend for intent classification. */
async function interpretCommand(text, lang = 'en-IN')
// Returns: { intent: string, params: object, reply?: string }
// On failure: returns { intent: 'UNKNOWN', params: {}, reply: 'Sorry, I could not understand.' }

/** Send image to backend for analysis. */
async function analyzeImage({ imageBase64, intent, params = {}, lang = 'en-IN' })
// Returns: { speech: string, items: Array, hazard: string, confidence: string }
// On failure: returns { speech: 'Analysis unavailable.', items: [], hazard: 'none', confidence: 'low' }
```

---

## 4. API Contract (Backend)

Base URL: `/api` (proxied by Vite in development to `http://localhost:3001`)

### 4.1 Health Check

```
GET /api/health
Response 200: { status: 'ok', timestamp: string }
```

### 4.2 Intent Classification

```
POST /api/intent
Content-Type: application/json

Request:  { text: string, lang: string }
Response: { intent: string, params: object, reply?: string }
Error:    { error: string }  (with HTTP 4xx/5xx)
```

### 4.3 Vision Analysis

```
POST /api/vision
Content-Type: application/json

Request:  { imageBase64: string, intent: string, params: object, lang: string }
Response: { speech: string, items: Array<{label, confidence, location}>, hazard: string, confidence: string }
Error:    { error: string }  (with HTTP 4xx/5xx)
```

### 4.4 Constraints

| Constraint | Value |
|---|---|
| Request timeout | 15 000 ms |
| Max image size | 512 KB (base64) |
| Max JSON body | 1 MB |
| Gemini credentials | Backend only — never in frontend code |
| Image persistence | None — images are not logged or stored |

### 4.5 Error Responses

All error responses use the same shape: `{ error: string }`

| HTTP Status | Meaning |
|---|---|
| 400 | Bad request (missing/invalid fields) |
| 413 | Image too large |
| 408 | Request timeout |
| 500 | Server error |
| 501 | Not implemented (stub routes) |
| 503 | AI service unavailable |

---

## 5. Intents

Use these exact strings. Defined in `frontend/src/core/intents.js`.

| Intent | Meaning |
|---|---|
| `DESCRIBE_SURROUNDINGS` | Describe what the camera sees |
| `READ_TEXT` | Read visible text (OCR) |
| `FIND_OBJECT` | Find a specific object |
| `FIND_WASHROOM` | Find a washroom/restroom |
| `NAVIGATE_HELP` | Navigation assistance |
| `OBSTACLE_CHECK` | Check for obstacles |
| `START_MONITORING` | Start continuous monitoring |
| `STOP` | Stop current action |
| `REPEAT` | Repeat last response |
| `HELP` | List available commands |
| `CHAT` | General conversation |
| `UNKNOWN` | Could not classify |

---

## 6. Enumerations

### Hazard Values
`'none'` | `'caution'` | `'danger'`

### Confidence Values
`'low'` | `'medium'` | `'high'`

### Voice States
`'listening'` | `'processing'` | `'idle'`

### Waveform States
`'listening'` | `'speaking'` | `'idle'`

---

## 7. Configuration

Defined in `frontend/src/config.js`.

| Key | Default | Notes |
|---|---|---|
| `API_BASE` | `'/api'` | Vite proxies to backend in dev |
| `DEFAULT_LANG` | `'en-IN'` | |
| `SUPPORTED_LANGS` | `['en-IN']` | Add `'kn-IN'`, `'hi-IN'` later |
| `REQUEST_TIMEOUT_MS` | `15000` | |
| `MAX_IMAGE_SIZE_BYTES` | `524288` (512 KB) | |
| `MONITORING_INTERVAL_MS` | `3000` | |

---

## 8. Error Handling Convention

1. Async module functions **do not throw** for expected errors (camera denied, network failure, etc.).
2. They return a documented fallback value (see §3).
3. They emit `app:error` with `{ source, message, recoverable }`.
4. The orchestrator listens for `app:error` and updates the UI and speaks the error if appropriate.
5. Unexpected errors (bugs) may still throw — the React error boundary catches those.

---

## 9. Git Workflow

1. All work on `main` branch (hackathon pace — no feature branches unless conflicts arise).
2. Checkpoint after every 2–3 related tasks: inspect `git status`, `git diff`, report changes.
3. Team Lead reviews and commits manually.
4. Never `git reset --hard`, `git clean`, or `git push --force`.
5. Never commit another member's unfinished work.

---

## 10. Safety Disclaimers

- DigitalVision is an assistive aid, NOT a safety device.
- Do not promise collision detection, exact distances, or safe navigation.
- Camera requires HTTPS (or localhost) and user permission.
- Placeholder responses must never masquerade as working AI in the demo.
