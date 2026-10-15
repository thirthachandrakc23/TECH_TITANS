/**
 * DigitalVision — Accessible Speech Synthesis Service
 *
 * Provides screen announcements using the browser's native Web Speech API (SpeechSynthesis).
 * Handles autoplay restrictions, voice selection, interruption, and concise surroundings formatting.
 */

let isVoiceMuted = false;
let isCurrentlySpeaking = false;
let audioContextInstance = null;

/**
 * Check if the browser supports SpeechSynthesis.
 * @returns {boolean}
 */
export function isSpeechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Check if the browser is currently vocalizing speech.
 * @returns {boolean}
 */
export function isSpeaking() {
  if (!isSpeechSupported()) return false;
  return isCurrentlySpeaking || window.speechSynthesis.speaking;
}

/**
 * Get or lazily initialize the Web Audio API AudioContext for accessible auditory cues.
 * @returns {AudioContext|null}
 */
function getAudioContext() {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioContextInstance) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioContextInstance = new AudioCtx();
      }
    }
    if (audioContextInstance && audioContextInstance.state === 'suspended') {
      audioContextInstance.resume().catch(() => {});
    }
    return audioContextInstance;
  } catch {
    return null;
  }
}

/**
 * Play gentle, non-vocal audio cues (chimes/clicks) using Web Audio API so blind users
 * receive progress feedback without voices talking over each other.
 *
 * @param {'start'|'tick'|'complete'|'warning'} type
 */
export function playAudioCue(type) {
  if (isVoiceMuted) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'tick') {
      // Soft, subtle ping during 10-second scan (every 2-3 seconds)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(580, now);
      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'start') {
      // Rising two-tone chime when a scan starts
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.14);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (type === 'complete') {
      // Harmonic chime when the 10-second scan finishes
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(783.99, now + 0.12); // G5
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'warning') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300, now);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  } catch {
    // Ignore audio cue errors if audio device is unavailable
  }
}

/**
 * Trigger subtle haptic vibration for mobile users.
 * @param {number|number[]} pattern
 */
export function triggerHaptic(pattern = 40) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Silent fail
    }
  }
}

/**
 * Toggle voice announcements on or off.
 * @param {boolean} [muted]
 * @returns {boolean} Current muted state.
 */
export function setVoiceMuted(muted) {
  isVoiceMuted = typeof muted === 'boolean' ? muted : !isVoiceMuted;
  if (isVoiceMuted && isSpeechSupported()) {
    isCurrentlySpeaking = false;
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
  isCurrentlySpeaking = false;
  if (isSpeechSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

/**
 * Speak text aloud cleanly using browser text-to-speech without overlapping.
 *
 * Guarantees:
 * - Anti-overlap mutex: sets isCurrentlySpeaking = true until utterance finishes.
 * - If interrupt is false and speech is ongoing, does NOT talk over active speech.
 * - If interrupt is true, cleans up ongoing utterance with a safe settling delay before speaking.
 *
 * @param {string} text - Text to vocalize.
 * @param {Object} [options]
 * @param {boolean} [options.interrupt=true] - Cancel ongoing speech before speaking.
 * @param {number} [options.rate=1.0] - Speed rate (0.8 - 1.2).
 * @param {number} [options.pitch=1.0] - Pitch (0.9 - 1.1).
 * @param {string} [options.lang='en-US'] - Preferred language.
 * @returns {Promise<void>} Resolves when speech finishes vocalizing.
 */
export function speak(text, { interrupt = true, rate = 1.0, pitch = 1.0, lang = 'en-US' } = {}) {
  return new Promise((resolve) => {
    if (!isSpeechSupported() || !text || isVoiceMuted) {
      resolve();
      return;
    }

    // Prevent background chatter from overlapping if speech is currently active
    if (isCurrentlySpeaking && !interrupt) {
      resolve();
      return;
    }

    if (interrupt) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }

    isCurrentlySpeaking = true;

    // 50ms buffer to allow Chrome/Edge synthesis cancel state to settle cleanly
    setTimeout(() => {
      if (isVoiceMuted) {
        isCurrentlySpeaking = false;
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.lang = lang;

      // Select natural sounding voice if available
      try {
        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          const preferred =
            voices.find(
              (v) =>
                v.lang.startsWith('en') &&
                (v.name.includes('Natural') || v.name.includes('Google') || v.default)
            ) ||
            voices.find((v) => v.lang.startsWith('en')) ||
            voices[0];
          if (preferred) {
            utterance.voice = preferred;
          }
        }
      } catch {
        // Fall back to default voice
      }

      let hasFinished = false;
      const onComplete = () => {
        if (!hasFinished) {
          hasFinished = true;
          isCurrentlySpeaking = false;
          resolve();
        }
      };

      utterance.onend = onComplete;
      utterance.onerror = onComplete;

      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        onComplete();
      }
    }, interrupt ? 50 : 0);
  });
}

/**
 * Format an aggregated map of detections collected across a 5-second scanning window.
 * Filters out transient 1-frame glitches, groups items by label and location,
 * and builds a calm, honest natural sentence for visually impaired users.
 *
 * @param {Map<string, { frameCount: number, maxCountInFrame: number, locations: Map<string, number>, maxScore: number }>} aggregatedDetections
 * @param {number} totalFramesScanned
 * @returns {string} Natural spoken summary of surroundings.
 */
export function formatAggregatedScanDescription(aggregatedDetections, totalFramesScanned = 1) {
  if (!aggregatedDetections || aggregatedDetections.size === 0) {
    return 'I completed a 5-second surroundings scan, and detected no distinct objects. Try pointing your camera toward another direction.';
  }

  // Filter: Keep only objects that appeared in at least 2 frames (or > 15% of total frames) to remove noise
  const minRequiredFrames = totalFramesScanned >= 5 ? 2 : 1;
  const reliableItems = [];

  for (const [label, data] of aggregatedDetections.entries()) {
    if (data.frameCount >= minRequiredFrames) {
      // Find the most frequent location where this object was seen
      let bestLoc = 'center';
      let maxLocCount = -1;
      if (data.locations) {
        for (const [loc, locCount] of data.locations.entries()) {
          if (locCount > maxLocCount) {
            maxLocCount = locCount;
            bestLoc = loc;
          }
        }
      }

      reliableItems.push({
        label,
        count: Math.max(1, data.maxCountInFrame || 1),
        location: bestLoc,
        score: data.maxScore,
        isPerson: label.toLowerCase() === 'person',
      });
    }
  }

  if (reliableItems.length === 0) {
    return 'I scanned for 5 seconds, but no steady objects were clearly identified. Try holding the camera steady or moving slowly.';
  }

  // Sort people first, then high-confidence items
  reliableItems.sort((a, b) => {
    if (a.isPerson && !b.isPerson) return -1;
    if (!a.isPerson && b.isPerson) return 1;
    return b.score - a.score;
  });

  const parts = [];
  for (const item of reliableItems) {
    const locDesc =
      item.location === 'left'
        ? 'on your left'
        : item.location === 'right'
        ? 'on your right'
        : 'in center view';

    const displayName = item.isPerson
      ? item.count === 1
        ? 'a person'
        : `${item.count} people`
      : item.count === 1
      ? `a ${item.label}`
      : `${item.count} ${item.label}s`;

    parts.push(`${displayName} ${locDesc}`);
  }

  if (parts.length === 1) {
    return `In your surroundings, I detected ${parts[0]}.`;
  }
  if (parts.length === 2) {
    return `In your surroundings, I detected ${parts[0]}, and ${parts[1]}.`;
  }
  return `In your surroundings, I detected ${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}.`;
}

/**
 * Format a single frame's detected objects (legacy / immediate fallback).
 *
 * @param {Array<{ label: string, score: number, location: 'left'|'center'|'right' }>} objects
 * @returns {string} Natural spoken description.
 */
export function formatSurroundingsDescription(objects) {
  if (!objects || objects.length === 0) {
    return 'No distinct objects detected in view.';
  }

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
    const isPerson = label.toLowerCase() === 'person';
    const name = isPerson
      ? count === 1
        ? 'a person'
        : `${count} people`
      : count === 1
      ? `a ${label}`
      : `${count} ${label}s`;
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
