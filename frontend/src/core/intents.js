/**
 * DigitalVision — Intent Strings
 *
 * Single source of truth for all intent identifiers.
 * Import these constants instead of using raw strings.
 *
 * FROZEN: Do not rename after teammates start implementation.
 * See docs/CONTRACT.md §5 for meanings.
 */

export const DESCRIBE_SURROUNDINGS = 'DESCRIBE_SURROUNDINGS';
export const READ_TEXT = 'READ_TEXT';
export const FIND_OBJECT = 'FIND_OBJECT';
export const FIND_WASHROOM = 'FIND_WASHROOM';
export const NAVIGATE_HELP = 'NAVIGATE_HELP';
export const OBSTACLE_CHECK = 'OBSTACLE_CHECK';
export const START_MONITORING = 'START_MONITORING';
export const STOP = 'STOP';
export const REPEAT = 'REPEAT';
export const HELP = 'HELP';
export const CHAT = 'CHAT';
export const UNKNOWN = 'UNKNOWN';

/** All valid intent strings as an array, for validation. */
export const ALL_INTENTS = [
  DESCRIBE_SURROUNDINGS,
  READ_TEXT,
  FIND_OBJECT,
  FIND_WASHROOM,
  NAVIGATE_HELP,
  OBSTACLE_CHECK,
  START_MONITORING,
  STOP,
  REPEAT,
  HELP,
  CHAT,
  UNKNOWN,
];
