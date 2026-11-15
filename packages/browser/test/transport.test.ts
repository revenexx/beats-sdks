// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTransport, MAX_BUFFER } from '../src/transport.js';
import { recordRequests } from './helpers.js';

const ev = (n: number) => ({ event: `e${n}` });

describe('transport', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('posts {key, consent, events} as text/plain to /e', async () => {
    const r = recordRequests();
    const t = createTransport('https://beats.test/', 'bk_1', 10, 1000, 3, () => false);
    t._push(ev(1));
    expect(r.fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(r.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = r.fetch.mock.calls[0]!;
    expect(url).toBe('https://beats.test/e');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(init.credentials).toBeUndefined();
    expect(init.headers).toEqual({ 'Content-Type': 'text/plain' }); // no CORS preflight
    expect(r.requests[0]!.body).toEqual({ key: 'bk_1', consent: false, events: [ev(1)] });
  });

  it('sends the consent state at the time of sending', async () => {
    const r = recordRequests();
    let consent = false;
    const t = createTransport('https://beats.test', 'k', 1, 10, 3, () => consent);
    t._push(ev(1));
    consent = true;
    await vi.advanceTimersByTimeAsync(0);
    t._push(ev(2), true);
    expect(r.requests.map((x) => x.body.consent)).toEqual([false, true]);
  });

  it('sends when the batch size is reached', async () => {
    const r = recordRequests();
    const t = createTransport('https://beats.test', 'k', 3, 10_000, 3, () => false);
    t._push(ev(1));
    t._push(ev(2));
    expect(r.fetch).not.toHaveBeenCalled();
    t._push(ev(3));
    expect(r.fetch).toHaveBeenCalledTimes(1);
    expect(r.requests[0]!.body.events).toHaveLength(3);
  });

  it('sends one request at a time and continues with the rest', async () => {
    const r = recordRequests();
    const t = createTransport('https://beats.test', 'k', 2, 1000, 3, () => false);
    for (let i = 0; i < 5; i++) t._push(ev(i));
    expect(r.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(r.fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(r.names()).toEqual(['e0', 'e1', 'e2', 'e3', 'e4']);
  });

  it('retries with exponential backoff and keeps the order', async () => {
    const statuses = [503, 0, 429, 200];
    const r = recordRequests(() => statuses.shift() ?? 200);
    vi.spyOn(Math, 'random').mockReturnValue(1); // no jitter
    const t = createTransport('https://beats.test', 'k', 10, 100, 5, () => false);
    t._push(ev(1));
    await vi.advanceTimersByTimeAsync(100);
    expect(r.fetch).toHaveBeenCalledTimes(1);
    t._push(ev(2));
    await vi.advanceTimersByTimeAsync(999);
    expect(r.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(r.fetch).toHaveBeenCalledTimes(2); // after 1 s
    await vi.advanceTimersByTimeAsync(2000);
    expect(r.fetch).toHaveBeenCalledTimes(3); // after 2 s more
    await vi.advanceTimersByTimeAsync(4000);
    expect(r.fetch).toHaveBeenCalledTimes(4); // after 4 s more, succeeds
    expect(r.requests[3]!.body.events).toEqual([ev(1), ev(2)]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(r.fetch).toHaveBeenCalledTimes(4);
  });

  it('caps the backoff at 30 seconds and drops the batch after maxRetries', async () => {
    const r = recordRequests(() => 500);
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const t = createTransport('https://beats.test', 'k', 10, 10, 7, () => false);
    t._push(ev(1));
    await vi.advanceTimersByTimeAsync(10);
    // retries after 1, 2, 4, 8, 16, 30, 30 seconds
    for (const s of [1, 2, 4, 8, 16, 30, 30]) await vi.advanceTimersByTimeAsync(s * 1000);
    expect(r.fetch).toHaveBeenCalledTimes(8);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(r.fetch).toHaveBeenCalledTimes(8);
    t._push(ev(2));
    await vi.advanceTimersByTimeAsync(10);
    expect(r.requests.at(-1)!.body.events).toEqual([ev(2)]);
  });

  it('drops a batch the server rejects (4xx) without retrying', async () => {
    const r = recordRequests(() => 400);
    const t = createTransport('https://beats.test', 'k', 1, 10, 5, () => false);
    t._push(ev(1));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(r.fetch).toHaveBeenCalledTimes(1);
  });

  it('buffers while offline and sends when the browser is online again', async () => {
    let online = false;
    Object.defineProperty(navigator, 'onLine', { get: () => online, configurable: true });
    const r = recordRequests(() => (online ? 200 : 0));
    const t = createTransport('https://beats.test', 'offline', 10, 10, 1, () => false);
    t._push(ev(1));
    t._push(ev(2));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(r.fetch).not.toHaveBeenCalled();
    online = true;
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    // transports of earlier tests listen to `online` too
    const mine = r.requests.filter((x) => x.body.key === 'offline');
    expect(mine.flatMap((x) => x.body.events.map((e) => e.event))).toEqual(['e1', 'e2']);
  });

  it('keeps a failed batch without using up retries when the browser went offline', async () => {
    let online = true;
    Object.defineProperty(navigator, 'onLine', { get: () => online, configurable: true });
    const r = recordRequests(() => {
      online = false;
      return 0;
    });
    const t = createTransport('https://beats.test', 'went-offline', 1, 10, 0, () => false);
    t._push(ev(1));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(r.fetch).toHaveBeenCalledTimes(1);
    online = true;
    r.fetch.mockImplementation(async (url: string, init: RequestInit) => {
      r.requests.push({ url, body: JSON.parse(init.body as string), beacon: false });
      return new Response(null, { status: 200 });
    });
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    const mine = r.requests.filter((x) => x.body.key === 'went-offline');
    expect(mine.map((x) => x.body.events[0]!.event)).toEqual(['e1', 'e1']);
  });

  it('keeps at most MAX_BUFFER events', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const r = recordRequests();
    const t = createTransport('https://beats.test', 'k', 5000, 10, 1, () => false);
    for (let i = 0; i < MAX_BUFFER + 5; i++) t._push(ev(i));
    t._flush(true);
    const sent = r.events();
    expect(sent).toHaveLength(MAX_BUFFER);
    expect(sent[0]).toEqual(ev(5));
  });

  it('sends everything with sendBeacon on a beacon flush, in batches', async () => {
    const r = recordRequests();
    const t = createTransport('https://beats.test', 'k', 2, 10_000, 3, () => false);
    t._push(ev(1));
    t._push(ev(2), false);
    expect(r.fetch).toHaveBeenCalledTimes(1);
    t._push(ev(3));
    t._push(ev(4), true);
    expect(r.sendBeacon).toHaveBeenCalledTimes(1);
    expect(r.requests.filter((x) => x.beacon).flatMap((x) => x.body.events)).toEqual([ev(3), ev(4)]);
  });

  it('falls back to fetch when sendBeacon refuses', () => {
    const r = recordRequests();
    r.sendBeacon.mockReturnValue(false);
    const t = createTransport('https://beats.test', 'k', 10, 10_000, 3, () => false);
    t._push(ev(1), true);
    expect(r.fetch).toHaveBeenCalledTimes(1);
  });

  it('can be cleared', async () => {
    const r = recordRequests();
    const t = createTransport('https://beats.test', 'k', 10, 10, 3, () => false);
    t._push(ev(1));
    t._clear();
    await vi.advanceTimersByTimeAsync(100);
    expect(r.fetch).not.toHaveBeenCalled();
  });
});
