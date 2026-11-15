/**
 * A random (version 4) UUID: `crypto.randomUUID` where available (secure
 * contexts, Node.js), otherwise built from `Math.random`. The ids are not
 * secrets, they only have to be unique.
 */
export function uuid(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (+c ^ ((Math.random() * 16) >> (+c / 4))).toString(16))
  );
}
