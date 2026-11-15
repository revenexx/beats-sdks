import {
  buildCommerce,
  checkEventName,
  COMMERCE_HELPERS,
  endpoint,
  isRetryable,
  SERVER_PATH,
  serverBody,
  uuid,
  type CommerceHelper,
  type CommerceInputs,
  type Envelope,
  type Properties,
} from '@beats-analytics/core';

export type { Amount, CommerceHelper, CommerceInputs, Envelope, Item, Properties } from '@beats-analytics/core';

export interface BeatsNodeOptions {
  /** Ingest key of the project (`bk_...`), sent as `Authorization: Bearer <key>`. */
  key: string;
  /** Origin of the beats server, for example `https://beats.example.com`. */
  host: string;
  /** Send when this many events are queued; also the largest batch. Default 50. */
  flushAt?: number;
  /** Send queued events after this many milliseconds. Default 5000. */
  flushInterval?: number;
  /** Retries of a failed request (network error, timeout, 408, 429, 5xx). Default 3. */
  maxRetries?: number;
  /** First retry delay in milliseconds; doubles on each retry, at most 30 s. `Retry-After` is honoured. Default 500. */
  retryDelay?: number;
  /** Request timeout in milliseconds. Default 10000. */
  timeout?: number;
  /** Events kept while the server cannot be reached; the oldest are dropped first. Default 10000. */
  maxQueueSize?: number;
  /** Flush queued events when the Node.js event loop is about to exit (`beforeExit`). Default true. */
  flushOnExit?: boolean;
  /** Currency of commerce events that name none (ISO 4217). */
  currency?: string;
  /** `fetch` implementation. Default: the global `fetch`. */
  fetch?: typeof fetch;
  /** Called when events could not be delivered. Default: `console.error`. */
  onError?: (error: Error, events: Envelope[]) => void;
  /** Called with validation warnings of commerce events. Default: `console.warn` when `debug` is set. */
  onWarning?: (warning: string) => void;
  /** Log requests. Default false. */
  debug?: boolean;
  /** Send nothing (for tests and development). Default false. */
  disabled?: boolean;
}

/** Options shared by every call. */
export interface EventOptions {
  /** When it happened. Default: the time of the call. */
  timestamp?: Date | string | number;
  /** Event id for deduplication. Default: a new UUID. Keep it when you resend the same event. */
  eventId?: string;
  sessionId?: string;
  /** Groups the event belongs to, for example `{ company: 'acme-gmbh' }`. */
  groups?: Record<string, string>;
  url?: string;
  referrer?: string;
}

export interface CaptureInput extends EventOptions {
  /** Who did it: your user id or an anonymous id from the browser. Required. */
  distinctId: string;
  event: string;
  properties?: Properties;
}

export interface IdentifyInput extends EventOptions {
  distinctId: string;
  /** Person properties (`$set`). */
  properties?: Properties;
  /** Person properties set only if not yet set (`$set_once`). */
  setOnce?: Properties;
  /** The anonymous id used before (`$anon_distinct_id`), for example from the browser client. */
  anonymousId?: string;
}

export interface GroupInput extends EventOptions {
  distinctId: string;
  type: string;
  key: string;
  properties?: Properties;
}

export type NodeCommerceMethods = {
  [K in CommerceHelper]: (distinctId: string, input: CommerceInputs[K], options?: EventOptions) => string;
};

/** The server is unreachable or answered with an error. */
export class BeatsError extends Error {
  /** HTTP status; 0 for network errors and timeouts. */
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'BeatsError';
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isoTime(t: Date | string | number | undefined): string {
  if (t === undefined) return new Date().toISOString();
  const d = t instanceof Date ? t : new Date(t);
  if (Number.isNaN(d.getTime())) throw new TypeError(`invalid timestamp: ${String(t)}`);
  return d.toISOString();
}

function retryAfter(res: Response): number | undefined {
  const v = res.headers.get('retry-after');
  if (!v) return undefined;
  const s = Number(v);
  if (Number.isFinite(s)) return s * 1000;
  const at = Date.parse(v);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

/**
 * Server-side client. Events are queued and sent in batches to
 * `POST {host}/api/v1/events`; call `shutdown()` before the process exits.
 */
export class Beats {
  private readonly o: Required<Omit<BeatsNodeOptions, 'currency' | 'onWarning' | 'fetch'>> &
    Pick<BeatsNodeOptions, 'currency' | 'onWarning' | 'fetch'>;
  private readonly url: string;
  private queue: Envelope[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private sending: Promise<void> = Promise.resolve();
  private closed = false;
  private readonly exitHook = () => void this.flush();

  constructor(options: BeatsNodeOptions) {
    if (!options?.key) throw new TypeError('beats: key is required');
    if (!options.host) throw new TypeError('beats: host is required');
    this.o = {
      flushAt: 50,
      flushInterval: 5000,
      maxRetries: 3,
      retryDelay: 500,
      timeout: 10_000,
      maxQueueSize: 10_000,
      flushOnExit: true,
      debug: false,
      disabled: false,
      onError: (err, events) => console.error(`[beats] ${events.length} events not delivered: ${err.message}`),
      ...options,
    };
    this.url = endpoint(options.host, SERVER_PATH);
    const proc = (globalThis as { process?: { once?: (e: string, f: () => void) => void } }).process;
    if (this.o.flushOnExit && typeof proc?.once === 'function') proc.once('beforeExit', this.exitHook);
  }

  /** Queues an event and returns its `event_id`. */
  capture(input: CaptureInput): string {
    const name = checkEventName(input?.event);
    if (name) throw new TypeError(`beats: ${name}`);
    return this.enqueue(input.event, input.distinctId, input.properties, input);
  }

  /** Sends `$identify`: links `anonymousId` to `distinctId` and sets person properties. */
  identify(input: IdentifyInput): string {
    return this.enqueue(
      '$identify',
      input.distinctId,
      { $anon_distinct_id: input.anonymousId, $set: input.properties, $set_once: input.setOnce },
      input,
    );
  }

  /** Sends `$set`: updates person properties without an event of its own. */
  setPersonProperties(distinctId: string, set: Properties, setOnce?: Properties, options?: EventOptions): string {
    return this.enqueue('$set', distinctId, { $set: set, $set_once: setOnce }, options);
  }

  /** Sends `$group`: sets properties of a group. */
  group(input: GroupInput): string {
    return this.enqueue(
      '$group',
      input.distinctId,
      { $group_type: input.type, $group_key: input.key, $group_set: input.properties },
      { ...input, groups: { ...input.groups, [input.type]: input.key } },
    );
  }

  /** Sends `$feature_used`. */
  featureUsed(distinctId: string, feature: string, variant?: string, options?: EventOptions): string {
    return this.enqueue('$feature_used', distinctId, { $feature: feature, $variant: variant }, options);
  }

  /** Sends all queued events. Resolves when they are delivered or given up on. */
  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const run = async () => {
      while (this.queue.length) await this.send(this.queue.splice(0, this.o.flushAt));
    };
    this.sending = this.sending.then(run, run);
    return this.sending;
  }

  /**
   * Sends queued events and stops the client. Later calls are ignored.
   * Waits at most `timeout` milliseconds (default: 3 × the request timeout).
   */
  async shutdown(timeout = this.o.timeout * 3): Promise<void> {
    this.closed = true;
    const proc = (globalThis as { process?: { off?: (e: string, f: () => void) => void } }).process;
    proc?.off?.('beforeExit', this.exitHook);
    let t: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([this.flush(), new Promise<void>((r) => (t = setTimeout(r, timeout)))]);
    clearTimeout(t);
  }

  /** Number of queued events. */
  get queued(): number {
    return this.queue.length;
  }

  private enqueue(event: string, distinctId: string, properties: Properties | undefined, opts: EventOptions = {}): string {
    if (typeof distinctId !== 'string' || !distinctId) throw new TypeError(`beats: distinctId is required (${event})`);
    if (distinctId.length > 200) throw new TypeError('beats: distinctId is longer than 200 characters');
    const e: Envelope = {
      event,
      event_id: opts.eventId ?? uuid(),
      timestamp: isoTime(opts.timestamp),
      distinct_id: distinctId,
      session_id: opts.sessionId,
      url: opts.url,
      referrer: opts.referrer,
      properties: properties ?? {},
      groups: opts.groups,
    };
    // drop undefined fields, so that the JSON is the same as what is sent
    const clean = JSON.parse(JSON.stringify(e)) as Envelope;
    if (this.closed || this.o.disabled) return clean.event_id!;
    this.queue.push(clean);
    if (this.queue.length > this.o.maxQueueSize) {
      const dropped = this.queue.splice(0, this.queue.length - this.o.maxQueueSize);
      this.o.onError(new BeatsError('queue full, oldest events dropped', 0), dropped);
    }
    if (this.queue.length >= this.o.flushAt) void this.flush();
    else if (!this.timer) {
      this.timer = setTimeout(() => void this.flush(), this.o.flushInterval);
      (this.timer as { unref?: () => void }).unref?.();
    }
    return clean.event_id!;
  }

  private async send(batch: Envelope[]): Promise<void> {
    const f = this.o.fetch ?? globalThis.fetch;
    const body = serverBody(batch);
    let lastError: BeatsError | undefined;
    for (let attempt = 0; attempt <= this.o.maxRetries; attempt++) {
      let wait = Math.min(30_000, this.o.retryDelay * 2 ** attempt);
      try {
        const res = await f(this.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.o.key}` },
          body,
          signal: AbortSignal.timeout(this.o.timeout),
        });
        if (this.o.debug) console.log(`[beats] POST ${this.url} ${batch.length} events: ${res.status}`);
        if (res.ok) return;
        const text = await res.text().catch(() => '');
        lastError = new BeatsError(`HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`, res.status);
        if (!isRetryable(res.status)) break;
        wait = Math.min(30_000, retryAfter(res) ?? wait);
      } catch (err) {
        lastError = new BeatsError((err as Error).message || 'network error', 0);
      }
      if (attempt < this.o.maxRetries) await sleep(wait);
    }
    this.o.onError(lastError!, batch);
  }
}

// The e-commerce helpers: `beats.orderCompleted(distinctId, { order_id, revenue, ... })`.
export interface Beats extends NodeCommerceMethods {}
for (const name of COMMERCE_HELPERS) {
  Object.defineProperty(Beats.prototype, name, {
    value(this: Beats, distinctId: string, input: never, options?: EventOptions): string {
      const self = this as unknown as { o: BeatsNodeOptions; enqueue: Beats['capture'] & ((...a: unknown[]) => string) };
      const b = buildCommerce(name, input, { currency: self.o.currency });
      for (const w of b.warnings) (self.o.onWarning ?? (self.o.debug ? (m: string) => console.warn(`[beats] ${m}`) : () => {}))(w);
      return self.enqueue(b.event, distinctId, b.properties, options);
    },
    writable: true,
    configurable: true,
  });
}
