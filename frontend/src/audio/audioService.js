/**
 * DigitalVision — Accessible Voice & Audio Service
 *
 * Provides complete voice interaction for visually impaired users:
 * - Free browser-native SpeechRecognition (webkitSpeechRecognition)
 * - Free browser-native SpeechSynthesis (Web Speech API)
 * - Free Web Audio API synthesized audio cues (chimes, clicks, pings)
 * - Live canvas visual waveform feedback
 *
 * Hands-free conversational loop:
 * When speech output ends, listening automatically resumes so the user
 * can speak commands without touching any button.
 */

import { bus } from '../core/eventBus.js';
import {
  APP_ERROR,
  VOICE_STATE,
  TTS_START,
  TTS_END,
} from '../core/events.js';
import { DEFAULT_LANG } from '../config.js';

// Browser API references
const SpeechRecognition =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

/** @type {SpeechRecognition|null} */
let recognitionInstance = null;
let isListeningActive = false;
let shouldKeepListening = false;
let currentLanguage = DEFAULT_LANG;
let recognitionRestartTimer = null;

/** @type {AudioContext|null} */
let audioCtx = null;
let waveformCanvas = null;
let waveformCtx = null;
let waveformAnimId = null;
let waveformState = 'idle'; // 'idle' | 'listening' | 'speaking'

let isSpeakingActive = false;
let onTranscriptCallback = null;
let onStateChangeCallback = null;

/**
 * Check if the browser supports Speech Recognition.
 * @returns {boolean}
 */
export function isSpeechRecognitionSupported() {
  return Boolean(SpeechRecognition);
}

/**
 * Check if the browser supports Speech Synthesis.
 * @returns {boolean}
 */
export function isSpeechSynthesisSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Get or initialize Web Audio Context for synthesized sound cues.
 * @returns {AudioContext|null}
 */
function getAudioContext() {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Play high-contrast auditory cues using Web Audio API synthesis.
 * Completely free, works offline, zero dependencies.
 *
 * @param {'listen_start'|'recognized'|'tick'|'nav_ping'|'book_snap'|'complete'|'stop'|'warning'} type
 */
export function playAudioCue(type) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    switch (type) {
      case 'listen_start': {
        // High, cheerful two-note chime signaling microphone is open
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
        break;
      }

      case 'recognized': {
        // Crisp affirmative ascending confirmation chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(880, now + 0.09);
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
        break;
      }

      case 'nav_ping': {
        // Soft sonar-like navigational location ping
        osc.type = 'sine';
        osc.frequency.setValueAtTime(784, now); // G5
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
        break;
      }

      case 'book_snap': {
        // Distinct camera shutter / page-turn click sound
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.07);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
        break;
      }

      case 'tick': {
        // Subtle progress tick
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        gain.gain.setValueAtTime(0.03, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
        break;
      }

      case 'complete': {
        // Warm resolution triad chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.09);
        osc.frequency.setValueAtTime(783.99, now + 0.18);
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
        break;
      }

      case 'stop': {
        // Descending stop chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now);
        osc.frequency.setValueAtTime(440, now + 0.1);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
        break;
      }

      case 'warning': {
        // Low cautionary buzzer
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
        break;
      }

      default:
        break;
    }
  } catch {
    // Non-blocking sound cue failure
  }
}

/**
 * Trigger subtle haptic vibration on mobile devices.
 * @param {number|number[]} pattern
 */
export function triggerHaptic(pattern = 50) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore haptic errors
    }
  }
}

/**
 * Start listening for user voice commands.
 * Automatically restarts recognition across conversational turns.
 *
 * @param {Object} [options]
 * @param {Function} [options.onTranscript] - Callback(finalText, isFinal)
 * @param {Function} [options.onStateChange] - Callback('listening' | 'processing' | 'idle')
 * @param {string} [options.lang=DEFAULT_LANG] - Spoken language
 * @param {boolean} [options.continuous=true] - Continuous listening loop
 * @returns {Promise<boolean>}
 */
export async function startListening({
  onTranscript = null,
  onStateChange = null,
  lang = DEFAULT_LANG,
  continuous = true,
} = {}) {
  if (!isSpeechRecognitionSupported()) {
    bus.emit(APP_ERROR, {
      source: 'audio',
      message: 'Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.',
      recoverable: true,
    });
    return false;
  }

  // If already actively speaking aloud, pause recognition until speech finishes
  if (isSpeakingActive) {
    shouldKeepListening = continuous;
    return true;
  }

  shouldKeepListening = continuous;
  currentLanguage = lang;
  if (onTranscript) onTranscriptCallback = onTranscript;
  if (onStateChange) onStateChangeCallback = onStateChange;

  if (isListeningActive && recognitionInstance) {
    return true;
  }

  try {
    if (recognitionInstance) {
      try {
        recognitionInstance.abort();
      } catch {}
      recognitionInstance = null;
    }

    const rec = new SpeechRecognition();
    recognitionInstance = rec;
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      isListeningActive = true;
      setWaveformState('listening');
      bus.emit(VOICE_STATE, { state: 'listening' });
      playAudioCue('listen_start');
      triggerHaptic(40);
      if (onStateChangeCallback) onStateChangeCallback('listening');
    };

    rec.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const item = event.results[i];
        const transcript = item[0]?.transcript || '';
        if (item.isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      const text = (final || interim).trim();
      const isFinal = Boolean(final.trim());

      if (text && onTranscriptCallback) {
        onTranscriptCallback(text, isFinal);
      }

      if (isFinal && text) {
        playAudioCue('recognized');
        triggerHaptic([40, 30, 40]);
        if (onStateChangeCallback) onStateChangeCallback('processing');
      }
    };

    rec.onerror = (event) => {
      // Ignore 'no-speech' or 'aborted' as standard conversational cycles
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }

      console.warn('[DigitalVision Voice] Recognition event notice:', event.error);

      if (event.error === 'not-allowed') {
        shouldKeepListening = false;
        bus.emit(APP_ERROR, {
          source: 'audio',
          message: 'Microphone permission was denied. Please allow microphone access in your browser settings.',
          recoverable: false,
        });
      }
    };

    rec.onend = () => {
      isListeningActive = false;
      bus.emit(VOICE_STATE, { state: 'idle' });

      // Automatically restart listening if still in conversational mode and not currently speaking
      if (shouldKeepListening && !isSpeakingActive) {
        if (recognitionRestartTimer) clearTimeout(recognitionRestartTimer);
        recognitionRestartTimer = setTimeout(() => {
          if (shouldKeepListening && !isSpeakingActive) {
            startListening({
              onTranscript: onTranscriptCallback,
              onStateChange: onStateChangeCallback,
              lang: currentLanguage,
              continuous: true,
            }).catch(() => {});
          }
        }, 200);
      } else {
        setWaveformState('idle');
        if (onStateChangeCallback) onStateChangeCallback('idle');
      }
    };

    rec.start();
    return true;
  } catch (err) {
    isListeningActive = false;
    bus.emit(APP_ERROR, {
      source: 'audio',
      message: `Failed to start voice listening: ${err.message}`,
      recoverable: true,
    });
    return false;
  }
}

/**
 * Stop speech recognition.
 * @returns {void}
 */
export function stopListening() {
  shouldKeepListening = false;
  if (recognitionRestartTimer) {
    clearTimeout(recognitionRestartTimer);
    recognitionRestartTimer = null;
  }

  if (recognitionInstance) {
    try {
      recognitionInstance.stop();
    } catch {}
    try {
      recognitionInstance.abort();
    } catch {}
    recognitionInstance = null;
  }

  isListeningActive = false;
  setWaveformState('idle');
  bus.emit(VOICE_STATE, { state: 'idle' });
  if (onStateChangeCallback) onStateChangeCallback('idle');
}

/**
 * Check if the assistant is actively listening to the user's voice.
 * @returns {boolean}
 */
export function isListening() {
  return isListeningActive;
}

/**
 * Speak text aloud using SpeechSynthesis.
 * Automatically coordinates with speech recognition: pauses mic during speech,
 * and seamlessly re-activates mic after speech so the conversation continues.
 *
 * @param {string} text - The spoken text.
 * @param {Object} [options]
 * @param {boolean} [options.interrupt=true] - Whether to cancel current speech immediately.
 * @param {string} [options.lang=DEFAULT_LANG] - Language code.
 * @param {number} [options.rate=1.05] - Speed rate (0.8 - 1.4).
 * @param {number} [options.pitch=1.0] - Pitch (0.8 - 1.2).
 * @param {boolean} [options.resumeListeningAfter=true] - Resume listening when speech finishes.
 * @returns {Promise<void>}
 */
export function speak(text, {
  interrupt = true,
  lang = DEFAULT_LANG,
  rate = 1.05,
  pitch = 1.0,
  resumeListeningAfter = true,
} = {}) {
  return new Promise((resolve) => {
    if (!text || typeof text !== 'string') {
      resolve();
      return;
    }

    if (!isSpeechSynthesisSupported()) {
      resolve();
      return;
    }

    // Temporarily pause recognition so assistant doesn't hear itself
    const wasListening = isListeningActive || shouldKeepListening;
    if (recognitionInstance) {
      try {
        recognitionInstance.abort();
      } catch {}
    }
    isListeningActive = false;

    if (interrupt) {
      window.speechSynthesis.cancel();
    }

    const cleanText = text.replace(/[*_#`~[\]]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanText) {
      resolve();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.pitch = pitch;

    // Pick best available natural voice
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const preferredVoice =
        voices.find((v) => v.lang === lang && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Ravi') || v.name.includes('Heera'))) ||
        voices.find((v) => v.lang.startsWith(lang.slice(0, 2))) ||
        voices.find((v) => v.lang.startsWith('en'));
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
    }

    utterance.onstart = () => {
      isSpeakingActive = true;
      setWaveformState('speaking');
      bus.emit(TTS_START, { text: cleanText });
    };

    const handleSpeechEnd = () => {
      isSpeakingActive = false;
      bus.emit(TTS_END, { text: cleanText });

      // Automatically re-activate microphone for hands-free conversation
      if (resumeListeningAfter && wasListening && shouldKeepListening) {
        setWaveformState('listening');
        setTimeout(() => {
          if (shouldKeepListening && !isSpeakingActive) {
            startListening({
              onTranscript: onTranscriptCallback,
              onStateChange: onStateChangeCallback,
              lang: currentLanguage,
              continuous: true,
            }).catch(() => {});
          }
        }, 300);
      } else {
        setWaveformState('idle');
      }

      resolve();
    };

    utterance.onend = handleSpeechEnd;
    utterance.onerror = (err) => {
      console.warn('[DigitalVision Speech] Utterance notice:', err?.error);
      handleSpeechEnd();
    };

    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Cancel any ongoing speech synthesis.
 * @returns {void}
 */
export function stopSpeaking() {
  if (isSpeechSynthesisSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
  isSpeakingActive = false;
  setWaveformState('idle');
  bus.emit(TTS_END, { text: '' });
}

/**
 * Check if the assistant is currently speaking.
 * @returns {boolean}
 */
export function isSpeaking() {
  if (!isSpeechSynthesisSupported()) return false;
  return isSpeakingActive || window.speechSynthesis.speaking;
}

/**
 * Set the current waveform visualization mode.
 * @param {'listening'|'speaking'|'idle'} state
 */
export function setWaveformState(state) {
  waveformState = state;
}

/**
 * Initialize high-aesthetic futuristic glowing audio visualizer on a canvas.
 * Draws pulsing frequency bars / responsive aura according to waveformState.
 *
 * @param {HTMLCanvasElement} canvasEl
 * @returns {() => void} Cleanup function
 */
export function initWaveform(canvasEl) {
  if (!canvasEl) return () => {};

  waveformCanvas = canvasEl;
  waveformCtx = canvasEl.getContext('2d');

  let phase = 0;

  const render = () => {
    if (!waveformCanvas || !waveformCtx) return;

    const w = waveformCanvas.width;
    const h = waveformCanvas.height;

    waveformCtx.clearRect(0, 0, w, h);

    phase += 0.05;
    const numBars = 32;
    const barWidth = w / numBars;
    const midY = h / 2;

    for (let i = 0; i < numBars; i++) {
      let amplitude = 4; // idle subtle breathing

      if (waveformState === 'listening') {
        // Vibrant undulating emerald/cyan wave
        amplitude =
          Math.sin(phase + i * 0.3) * 18 +
          Math.cos(phase * 1.5 + i * 0.2) * 12 +
          24;
      } else if (waveformState === 'speaking') {
        // High dynamic violet/gold speech pulses
        amplitude =
          Math.abs(Math.sin(phase * 2 + i * 0.4)) * 32 +
          Math.cos(phase + i * 0.1) * 10 +
          14;
      }

      amplitude = Math.max(4, Math.min(midY - 2, amplitude));

      const x = i * barWidth + barWidth * 0.2;
      const barW = barWidth * 0.6;
      const y = midY - amplitude;
      const barH = amplitude * 2;

      // Color scheme according to state
      let fill = 'rgba(0, 229, 255, 0.35)'; // cyan idle
      if (waveformState === 'listening') {
        fill = i % 2 === 0 ? '#00e5ff' : '#00ff88'; // neon cyan & emerald
      } else if (waveformState === 'speaking') {
        fill = i % 2 === 0 ? '#a78bfa' : '#38bdf8'; // glowing lavender & sky blue
      }

      waveformCtx.fillStyle = fill;
      waveformCtx.beginPath();
      waveformCtx.roundRect(x, y, barW, barH, 4);
      waveformCtx.fill();
    }

    waveformAnimId = requestAnimationFrame(render);
  };

  waveformAnimId = requestAnimationFrame(render);

  return () => {
    if (waveformAnimId) {
      cancelAnimationFrame(waveformAnimId);
      waveformAnimId = null;
    }
  };
}
