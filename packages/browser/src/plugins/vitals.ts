import type { Plugin } from '../client.js';

interface Shift extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}

interface Timing extends PerformanceEntry {
  interactionId?: number;
}

/**
 * `$web_vitals`, sent once when the page is first hidden. Uses
 * `PerformanceObserver` only. INP is the longest interaction seen, not the
 * 98th percentile; CLS uses session windows (gap 1 s, at most 5 s).
 */
export const vitals: Plugin = (ctx) => () => {
  if (!ctx._o?.trackWebVitals || typeof PerformanceObserver === 'undefined') return;
  const v: Record<string, number> = {};
  const observe = (type: string, cb: (e: PerformanceEntry) => void, opts?: object) => {
    try {
      new PerformanceObserver((l) => l.getEntries().forEach(cb)).observe({ type, buffered: true, ...opts });
    } catch {
      // entry type not supported by this browser
    }
  };
  let cls = 0;
  let win = 0;
  let first = 0;
  let prev = 0;
  observe('largest-contentful-paint', (e) => (v.$lcp_ms = e.startTime));
  observe('paint', (e) => e.name === 'first-contentful-paint' && (v.$fcp_ms = e.startTime));
  observe('layout-shift', (e) => {
    const s = e as Shift;
    if (s.hadRecentInput) return;
    if (win && s.startTime - prev < 1000 && s.startTime - first < 5000) win += s.value;
    else {
      win = s.value;
      first = s.startTime;
    }
    prev = s.startTime;
    v.$cls = cls = Math.max(cls, win);
  });
  observe('event', (e) => (e as Timing).interactionId && (v.$inp_ms = Math.max(v.$inp_ms ?? 0, e.duration)), { durationThreshold: 40 });
  const nav = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (nav) v.$ttfb_ms = nav.responseStart;

  let sent = false;
  ctx._hide.push(() => {
    if (sent || !Object.keys(v).length) return;
    sent = true;
    const p: Record<string, number> = {};
    for (const k in v) p[k] = k === '$cls' ? Math.round((v[k] as number) * 1000) / 1000 : Math.round(v[k] as number);
    ctx._send('$web_vitals', p);
  });
};
