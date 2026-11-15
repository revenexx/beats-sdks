import type { BeatsCore, BeatsOptions } from './types.js';

type Call = [string, ...unknown[]];

/**
 * Script-tag loader. Options come from the `data-*` attributes of the script
 * element, named like the `init` options (`data-track-outbound-links`,
 * `data-cookieless="false"`); `data-api` sets `apiHost` and defaults to the
 * origin of the script. It replays calls queued by the stub
 * `window.beats = window.beats || function(){(beats.q=beats.q||[]).push(arguments)}`
 * and replaces it with a function that forwards to the client:
 * `beats('track', 'signup', {...})` and `beats.track('signup', {...})` both work.
 */
export function boot(client: BeatsCore): void {
  const w = window as unknown as { beats?: unknown };
  const script = document.currentScript as HTMLScriptElement | null;
  const c = client as unknown as Record<string, (...a: unknown[]) => void>;
  const api = Object.assign((m: string, ...a: unknown[]) => c[m]?.(...a), client);
  const queue = (w.beats as { q?: Iterable<Call> } | undefined)?.q ?? [];
  w.beats = api;
  const o: Record<string, unknown> = {};
  const d = script?.dataset ?? {};
  for (const k in d) {
    // "false" -> false, "" and "true" -> true, anything else stays a string
    const v = d[k] as string;
    o[k] = v != 'false' && (v == '' || v == 'true' || v);
  }
  o.apiHost = d.api ?? new URL(script!.src).origin;
  if (d.key) client.init(o as unknown as BeatsOptions);
  // replayed after init; the first pageview is sent after this task, so queued consent calls apply to it
  for (const args of queue as Iterable<Call>) api(...args);
}
