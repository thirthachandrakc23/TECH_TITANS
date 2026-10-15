/**
 * DigitalVision — Event Names
 *
 * Single source of truth for all event bus event names.
 * Import these constants instead of using raw strings.
 *
 * FROZEN: Do not rename after teammates start implementation.
 * See docs/CONTRACT.md §2 for payloads and meanings.
 */

/** App initialized, modules should start. Payload: { lang: string } */
export const APP_START = 'app:start';

/** Microphone stream obtained. Payload: { stream: MediaStream } */
export const MIC_STREAM = 'mic:stream';

/** Voice recognition state changed. Payload: { state: 'listening' | 'processing' | 'idle' } */
export const VOICE_STATE = 'voice:state';

/** Speech recognized. Payload: { text: string, isFinal: boolean, lang: string } */
export const VOICE_TRANSCRIPT = 'voice:transcript';

/** Text-to-speech started. Payload: { text: string } */
export const TTS_START = 'tts:start';

/** Text-to-speech finished. Payload: {} */
export const TTS_END = 'tts:end';

/** Update caption/status display. Payload: { text: string, type: 'info' | 'success' | 'warning' | 'error' } */
export const UI_CAPTION = 'ui:caption';

/** An error occurred. Payload: { source: string, message: string, recoverable: boolean } */
export const APP_ERROR = 'app:error';
