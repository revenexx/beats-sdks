import { uuid, type Envelope, type Properties } from '@revenexx/beats-core';
import { createTransport, type Transport } from './transport.js';
import type { BeatsCore, BeatsOptions } from './types.js';

/**
 * Storage keys. In cookieless mode nothing is stored, except the opt-out
 * flag after `optOut()`.
 */
export const KEYS = /* @__PURE__ */ {
  /** localStorage: anonymous id (identified mode). */
  anonymousId: 'beats_id',
  /** localStorage: user id from `identify` (identified mode). */
  userId: 'beats_uid',
  /** sessionStorage: `<session id>.<time of last event>` (identified mode). */
  session: 'beats_sid',
  /** localStorage: `1` after `optOut()`. */
  optOut: 'beats_optout',
} as const;

/**
 * Query parameters kept in captured URLs and referrers by default: the UTM
 * campaign parameters and Google Ads' `gclid` (the server reads them for
 * campaigns and channels). Everything else in the query string, and the
 * fragment, is removed unless `captureQueryString` is true.
 */
export const DEFAULT_QUERY_PARAMS: string[] = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid'];

export const AID = 'beats_id';
export const UID = 'beats_uid';
const SID = 'beats_sid';

/** Internal state shared with plugins. */
export interface State {
  /** Identified mode (ids in browser storage). */
  _id: boolean;
  /** Anonymous id (identified mode only). */
  _aid?: string | null;
  /** User id from `identify`. */
  _uid?: string | null;
  /** Groups added to every event. */
  _g?: Record<string, string>;
  /** Super properties. */
  _p: Properties;
  /** Sending is disabled (opt-out, Do Not Track). */
  _x: boolean;
  /** Session id (identified mode). */
  _sid?: string;
}

/** What a plugin gets to work with. */
export interface Ctx {
  /** Options, set by `init`. */
  _o?: BeatsOptions;
  _s: State;
  /** The transport, set by `init`. */
  _t?: Transport;
  /** Builds the envelope and queues it; `now` sends right away with a beacon. */
  _send(event: string, props?: Properties, extra?: Partial<Envelope>, now?: boolean): void;
  /** Defines a public method; calls before `init` are queued. */
  _def(name: string, fn: (...a: never[]) => unknown): void;
  /** Writes to localStorage in identified mode; `undefined` removes the key. */
  _store(key: string, value?: string | null): void;
  /** Called when the page is hidden or left, before queued events are sent. */
  _hide: (() => void)[];
}

/** A plugin adds methods with `ctx._def` and may return a function that runs at `init`. */
export type Plugin = (ctx: Ctx) => void | (() => void);

const hasWindow = typeof window != 'undefined';

/**
 * True in the npm build: calls made before `init` are queued and `init` does
 * nothing without `window` (server-side rendering). The script-tag builds set
 * it to false: there the loader's stub queue keeps early calls.
 */
declare const __BEATS_NPM__: boolean;

/**
 * Reads (`value` omitted), writes or removes (`value` null) a key in
 * localStorage or sessionStorage. Blocked or full storage is ignored.
 */
export function st(session: 0 | 1, key: string, value?: string | null): string | null | undefined {
  try {
    const s = session ? sessionStorage : localStorage;
    if (value === undefined) return s.getItem(key);
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    // storage blocked: ids stay in memory
  }
  return undefined;
}

/**
 * Creates a client with the web analytics core (pageviews, SPA navigation,
 * page leave, custom events, consent) and the given plugins.
 */
export function createClient<T extends BeatsCore = BeatsCore>(plugins: Plugin[] = []): T {
  const client = {} as Record<string, (...a: unknown[]) => unknown>;
  const pending: [string, unknown[]][] = [];
  const inits: (() => void)[] = [];
  const s: State = { _id: false, _p: {}, _x: false };
  const on = (type: string, fn: () => void) => addEventListener(type, fn, { passive: true });
  let t: Transport | undefined;
  let o: BeatsOptions | undefined;
  // time of the last event, for the session timeout (identified mode)
  let seen = 0;
  // current page view: URL key, URL, visible time and scroll depth
  let key = '';
  let lastUrl: string | undefined;
  let visibleSince = 0;
  let visible = 0;
  let depth = 0;
  let leavePending = false;
  // query parameters kept in URLs (allowedQueryParams)
  let keep: string[] = [];

  // A URL as it is sent: without query string and fragment (except the
  // allowed parameters) unless `captureQueryString`, then `sanitizeUrl`.
  // Only called with absolute URLs (location.href, document.referrer).
  const clean = (u: string): string => {
    if (!o!.captureQueryString) {
      const x = new URL(u);
      const q = x.searchParams;
      for (const k of [...q.keys()]) if (!keep.includes(k)) q.delete(k);
      // with hash routing the fragment is the route: keep its path, not its query
      x.hash = o!.hashRouting ? (x.hash.split('?')[0] as string) : '';
      u = x.href;
    }
    return o!.sanitizeUrl ? o!.sanitizeUrl(u) : u;
  };

  const ctx: Ctx = {
    _s: s,
    _hide: [],
    _def(name, fn) {
      client[name] = __BEATS_NPM__
        ? (...a: unknown[]) => {
            if (o) return (fn as (...x: unknown[]) => unknown)(...a);
            if (hasWindow && pending.length < 100) pending.push([name, a]);
          }
        : (fn as (...x: unknown[]) => unknown);
    },
    _store(k, v) {
      if (s._id) st(0, k, v ?? null);
    },
    _send(event, props, extra, now) {
      if (!t || s._x) return;
      const at = Date.now();
      if (s._id) {
        // a new session after `sessionTimeout` minutes without events
        if (!s._sid || at - seen > (o!.sessionTimeout ?? 30) * 6e4) s._sid = uuid();
        seen = at;
        st(1, SID, s._sid + '.' + at);
      }
      // undefined fields are left out by JSON.stringify
      let e: Envelope | null = {
        event,
        event_id: uuid(),
        timestamp: new Date(at).toISOString(),
        distinct_id: s._uid || s._aid || undefined,
        session_id: s._sid || undefined,
        url: location.href,
        title: o!.captureTitle === false ? undefined : document.title,
        screen_width: innerWidth,
        language: navigator.language,
        properties: { ...s._p, ...props },
        groups: s._g && { ...s._g },
        ...extra,
      };
      try {
        if (e.url) e.url = clean(e.url);
        if (e.referrer) e.referrer = clean(e.referrer);
        if (o!.beforeSend) e = o!.beforeSend(e);
      } catch (err) {
        // a failing hook drops the event instead of sending what it was meant to change
        console.error('[beats] dropped', event, err);
        e = null;
      }
      if (!e) return;
      if (o!.debug) console.log('[beats]', event, e);
      t._push(e, now);
    },
  };

  function identified(): void {
    if (!s._id) {
      const [id, at] = (st(1, SID) ?? '').split('.');
      s._sid = id;
      seen = +(at as string);
    }
    s._id = true;
    s._aid = st(0, AID) ?? s._aid ?? uuid();
    s._uid ??= st(0, UID);
    ctx._store(AID, s._aid);
    ctx._store(UID, s._uid);
  }

  const pageKey = () => location.pathname + location.search + (o!.hashRouting ? location.hash : '');

  const scroll = () => {
    const h = document.documentElement.scrollHeight;
    depth = Math.max(depth, h ? Math.min(100, Math.round(((scrollY + innerHeight) / h) * 100)) : 100);
  };

  // Ends the visible period of the page view and reports it as `$pageleave`.
  function leave(): void {
    if (visibleSince) visible += Date.now() - visibleSince;
    if (leavePending && o!.trackPageleave !== false)
      ctx._send('$pageleave', { $duration_ms: Math.round(visible), $scroll_depth: depth }, { url: lastUrl });
    leavePending = false;
    visibleSince = visible = 0;
  }

  function pageview(props?: Properties): void {
    if (lastUrl) leave();
    key = pageKey();
    ctx._send('$pageview', props, { referrer: lastUrl ?? (document.referrer || undefined) });
    lastUrl = location.href;
    depth = 0;
    scroll();
    visibleSince = document.hidden ? 0 : Date.now();
    leavePending = true;
  }

  function hidden(): void {
    for (const f of ctx._hide) f();
    leave();
    t!._flush(true);
  }

  ctx._def('track', (event: string, props?: Properties) => ctx._send(event, props));
  ctx._def('pageview', pageview);
  ctx._def('register', (p: Properties) => void Object.assign(s._p, p));
  ctx._def('unregister', (name: string) => void delete s._p[name]);
  ctx._def('flush', () => t!._flush());
  ctx._def('consent', (granted: boolean) => {
    if (granted) return identified();
    st(0, AID, null);
    st(0, UID, null);
    st(1, SID, null);
    s._id = false;
    s._aid = s._uid = s._sid = undefined;
  });

  for (const p of plugins) {
    const f = p(ctx);
    if (f) inits.push(f);
  }

  client.init = (options) => {
    const opts = options as BeatsOptions;
    if (o || (__BEATS_NPM__ && !hasWindow)) return;
    // the script-tag loader only calls init with a key and an API host
    if (__BEATS_NPM__ && (!opts?.key || !opts.apiHost)) return console.warn('beats: key and apiHost required');
    o = ctx._o = opts;
    // a list, or comma-separated from a script tag's data-allowed-query-params
    keep = ('' + (opts.allowedQueryParams ?? DEFAULT_QUERY_PARAMS)).split(',');
    const b = opts.batching;
    const cfg = { size: b === false ? 1 : 10, interval: 1000, ...(b as object) };
    t = ctx._t = createTransport(opts.apiHost, opts.key, cfg.size, cfg.interval, opts.maxRetries ?? 10, () => s._id);
    // automated browsers send nothing; an opt-out stored by the full client is honoured by every build
    s._x = navigator.webdriver || st(0, KEYS.optOut) == '1';
    if (opts.cookieless === false || st(0, AID)) identified();

    on('visibilitychange', () => {
      if (document.hidden) hidden();
      else if (lastUrl) {
        visibleSince = Date.now();
        leavePending = true;
      }
    });
    on('pagehide', hidden);
    on('scroll', scroll);

    for (const f of inits) f();
    if (__BEATS_NPM__) for (const [name, a] of pending.splice(0)) client[name]!(...a);

    if (opts.autoPageviews !== false) {
      const changed = () => pageKey() != key && pageview();
      for (const m of ['pushState', 'replaceState'] as const) {
        const orig = history[m];
        history[m] = function (this: History, ...a: Parameters<History['pushState']>) {
          orig.apply(this, a);
          changed();
        };
      }
      on('popstate', changed);
      // after the current task, so that `consent` or `register` right after `init` apply to it
      setTimeout(() => lastUrl || pageview());
    }
  };

  return client as unknown as T;
}
