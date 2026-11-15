export * from './types.js';
export * from './normalize.js';
export * from './commerce.js';
export * from './protocol.js';
export { uuid } from './uuid.js';

/** Longest event name accepted by beats. */
export const MAX_EVENT_NAME = 200;

/** Returns a problem with the event name, or `undefined` when it is valid. */
export function checkEventName(name: unknown): string | undefined {
  if (typeof name !== 'string' || name.length === 0) return 'event name must be a non-empty string';
  if (name.length > MAX_EVENT_NAME) return `event name is longer than ${MAX_EVENT_NAME} characters`;
  return undefined;
}
