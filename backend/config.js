/**
 * DigitalVision — Backend Configuration
 *
 * Single configuration module for backend environment variables,
 * model identifiers, limits, and supported constants.
 *
 * Owner: Member 3 (AI)
 */

import 'dotenv/config';

/** Server port (default: 3001) */
export const PORT = parseInt(process.env.PORT || '3001', 10);

/**
 * Gemini API Key.
 * Read strictly from process.env — NEVER committed to source control.
 */
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

/**
 * Gemini Multimodal Model Identifier.
 * Kept in this single configuration constant as required by the contract.
 * Default: gemini-2.5-flash (with override available via process.env.GEMINI_MODEL)
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

/** Configurable request timeout in milliseconds (~15 seconds) */
export const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '15000', 10);

/** Maximum image size in bytes (512 KB per CONTRACT.md §4.4) */
export const MAX_IMAGE_BYTES = 512 * 1024;

/** Maximum JSON body size limit */
export const MAX_BODY_LIMIT = '1mb';

/** Supported intents list (matching frontend/src/core/intents.js) */
export const ALL_INTENTS = [
  'DESCRIBE_SURROUNDINGS',
  'READ_TEXT',
  'FIND_OBJECT',
  'FIND_WASHROOM',
  'NAVIGATE_HELP',
  'OBSTACLE_CHECK',
  'START_MONITORING',
  'STOP',
  'REPEAT',
  'HELP',
  'CHAT',
  'UNKNOWN',
];

/** Valid hazard ratings */
export const HAZARD_LEVELS = ['none', 'caution', 'danger'];

/** Valid confidence ratings */
export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'];
