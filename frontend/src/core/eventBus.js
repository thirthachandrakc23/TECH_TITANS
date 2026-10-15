/**
 * DigitalVision — Event Bus
 *
 * Minimal pub/sub for decoupled module communication.
 * See docs/CONTRACT.md §2 for the event catalogue.
 *
 * Usage:
 *   import { bus } from '../core/eventBus.js';
 *   bus.on('voice:transcript', (payload) => { ... });
 *   bus.emit('voice:transcript', { text: 'hello', isFinal: true, lang: 'en-IN' });
 *   bus.off('voice:transcript', handler);
 */

class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * Subscribe to an event.
   * @param {string} name - Event name (use constants from events.js).
   * @param {Function} fn - Callback receiving the event payload.
   */
  on(name, fn) {
    if (!this._listeners.has(name)) {
      this._listeners.set(name, new Set());
    }
    this._listeners.get(name).add(fn);
  }

  /**
   * Unsubscribe from an event.
   * @param {string} name - Event name.
   * @param {Function} fn - The exact callback reference passed to on().
   */
  off(name, fn) {
    const set = this._listeners.get(name);
    if (set) {
      set.delete(fn);
      if (set.size === 0) {
        this._listeners.delete(name);
      }
    }
  }

  /**
   * Emit an event to all subscribers.
   * @param {string} name - Event name.
   * @param {*} payload - Data to pass to each callback.
   */
  emit(name, payload) {
    if (import.meta.env?.DEV) {
      console.debug(`[EventBus] ${name}`, payload);
    }
    const set = this._listeners.get(name);
    if (set) {
      for (const fn of set) {
        try {
          fn(payload);
        } catch (err) {
          console.error(`[EventBus] Error in listener for "${name}":`, err);
        }
      }
    }
  }
}

/** Singleton event bus instance — import this. */
export const bus = new EventBus();
