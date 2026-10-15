/**
 * DigitalVision — Accessible Speech Synthesis Service
 *
 * Provides screen announcements using the browser's native Web Speech API (SpeechSynthesis).
 * Handles autoplay restrictions, voice selection, interruption, and concise surroundings formatting.
 */

let isVoiceMuted = false;

/**
 * Check if the browser supports SpeechSynthesis.
 * @returns {boolean}
 */
export function isSpeechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Toggle voice announcements on or off.
 * @param {boolean} [muted]
 * @returns {boolean} Current muted state.
 */
export function setVoiceMuted(muted) {
  isVoiceMuted = typeof muted === 'boolean' ? muted : !isVoiceMuted;
  if (isVoiceMuted && isSpeechSupported()) {
    window.speechSynthesis.cancel();
  }
  return isVoiceMuted;
}

/**
 * Check if voice is currently muted.
 * @returns {boolean}
 */
export function getVoiceMuted() {
  return isVoiceMuted;
}

/**
 * Stop any ongoing speech synthesis immediately.
 */
export function stopSpeaking() {
  if (isSpeechSupported()) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Speak text aloud using browser text-to-speech.
 *
 * @param {string} text - Text to vocalize.
 * @param {Object} [options]
 * @param {boolean} [options.interrupt=true] - Cancel ongoing speech before speaking.
 * @param {number} [options.rate=1.0] - Speed rate (0.8 - 1.2).
 * @param {number} [options.pitch=1.0] - Pitch (0.9 - 1.1).
 * @param {string} [options.lang='en-US'] - Preferred language.
 * @returns {Promise<void>}
 */
export function speak(text, { interrupt = true, rate = 1.0, pitch = 1.0, lang = 'en-US' } = {}) {
  return new Promise((resolve) => {
    if (!isSpeechSupported() || !text || isVoiceMuted) {
      resolve();
      return;
    }

    if (interrupt) {
      window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.lang = lang;

    // Select the best matching voice if available
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      const preferred = voices.find(
        (v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.default)
      ) || voices.find((v) => v.lang.startsWith('en')) || voices[0];
      if (preferred) {
        utterance.voice = preferred;
      }
    }

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Format a list of detected objects into an honest, concise spoken sentence.
 * Strictly avoids asserting distance or safety guarantees.
 *
 * @param {Array<{ label: string, score: number, location: 'left'|'center'|'right' }>} objects
 * @returns {string} Natural spoken description.
 */
export function formatSurroundingsDescription(objects) {
  if (!objects || objects.length === 0) {
    return 'No distinct objects detected in view.';
  }

  // Count items by label and track representative location
  const counts = new Map();
  const locations = new Map();

  for (const obj of objects) {
    counts.set(obj.label, (counts.get(obj.label) || 0) + 1);
    if (!locations.has(obj.label)) {
      locations.set(obj.label, obj.location);
    }
  }

  const parts = [];
  for (const [label, count] of counts.entries()) {
    const loc = locations.get(label);
    const locDesc = loc === 'left' ? 'on the left' : loc === 'right' ? 'on the right' : 'in center view';
    const name = count === 1 ? `a ${label}` : `${count} ${label}s`;
    parts.push(`${name} ${locDesc}`);
  }

  if (parts.length === 1) {
    return `I see ${parts[0]}.`;
  }
  if (parts.length === 2) {
    return `I see ${parts[0]}, and ${parts[1]}.`;
  }
  return `I see ${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}.`;
}
