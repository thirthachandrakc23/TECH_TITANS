/**
 * DigitalVision — Shared Configuration
 *
 * Central place for constants shared across modules.
 * See docs/CONTRACT.md §7 for the full table.
 */

/** Base URL for backend API calls. Vite proxies this to localhost:3001 in dev. */
export const API_BASE = '/api';

/** Default language for speech recognition and AI requests. */
export const DEFAULT_LANG = 'en-IN';

/** Languages the app is designed to support (extend later). */
export const SUPPORTED_LANGS = ['en-IN'];

/** Maximum time to wait for a backend response (ms). */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Maximum image size allowed for vision requests (bytes). 512 KB. */
export const MAX_IMAGE_SIZE_BYTES = 512 * 1024;

/** Interval between automatic frame captures during monitoring (ms). */
export const MONITORING_INTERVAL_MS = 3_000;

/** Valid hazard levels returned by the vision API. */
export const HAZARD_VALUES = ['none', 'caution', 'danger'];

/** Valid confidence levels returned by the vision API. */
export const CONFIDENCE_VALUES = ['low', 'medium', 'high'];
