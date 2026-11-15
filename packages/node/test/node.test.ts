import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import golden from '../../core/test/golden/commerce.json' with { type: 'json' };
import { Beats, BeatsError, type CommerceHelper, type Envelope } from '../src/index.js';

interface Req {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: { batch: Envelope[] };
}

let server: Server;
let host: string;
const requests: Req[] = [];
let respond: (req: Req, n: number) => { status: number; headers?: Record<string, string>; delay?: number } = () => ({ status: 202 });

beforeAll(async () => {
  server = createServer((req, res) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', async () => {
      const r: Req = { method: req.method!, path: req.url!, headers: req.headers, body: JSON.parse(s || '{}') };
      requests.push(r);
      const a = respond(r, requests.length);
      if (a.delay) await new Promise((x) => setTimeout(x, a.delay));
      res.writeHead(a.status, a.headers).end(a.status >= 400 ? 'error' : '');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise((r) => server.close(r)));

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ status: 202 });
});

const client = (o: Partial<ConstructorParameters<typeof Beats>[0]> = {}) =>
  new Beats({ key: 'bk_server', host, flushOnExit: false, retryDelay: 10, onError: vi.fn(), ...o });

const events = () => requests.flatMap((r) => r.body.batch);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('requests', () => {
  it('posts {batch} as JSON with the key as bearer token to /api/v1/events', async () => {
    const b = client();
    const id = b.capture({ distinctId: 'user-1', event: 'signup', properties: { plan: 'pro' } });
    await b.flush();
    expect(requests).toHaveLength(1);
    const r = requests[0]!;
    expect(r.method).toBe('POST');
    expect(r.path).toBe('/api/v1/events');
    expect(r.headers.authorization).toBe('Bearer bk_server');
    expect(r.headers['content-type']).toBe('application/json');
    expect(r.body).toEqual({
      batch: [{ event: 'signup', event_id: id, timestamp: expect.any(String), distinct_id: 'user-1', properties: { plan: 'pro' } }],
    });
    expect(id).toMatch(UUID);
  });

  it('requires a distinct id and a valid event name', () => {
    const b = client();
    expect(() => b.capture({ event: 'x' } as never)).toThrow(/distinctId is required/);
    expect(() => b.capture({ distinctId: '', event: 'x' })).toThrow(/distinctId is required/);
    expect(() => b.capture({ distinctId: 'x'.repeat(201), event: 'x' })).toThrow(/longer than 200/);
    expect(() => b.capture({ distinctId: 'u', event: '' })).toThrow(/event name/);
    expect(() => b.orderCompleted('', { order_id: 'o' })).toThrow(/distinctId is required/);
    expect(() => new Beats({ key: '', host })).toThrow(/key/);
    expect(() => new Beats({ key: 'k', host: '' })).toThrow(/host/);
  });

  it('accepts timestamps as Date, ISO string or milliseconds and keeps given event ids', async () => {
    const b = client();
    const at = new Date('2026-11-01T10:00:00Z');
    b.capture({ distinctId: 'u', event: 'a', timestamp: at });
    b.capture({ distinctId: 'u', event: 'b', timestamp: '2026-11-01T11:00:00+01:00' });
    b.capture({ distinctId: 'u', event: 'c', timestamp: at.getTime(), eventId: '0b6e4d1e-7c1f-4c51-9d55-6a0f7c1b2a3d' });
    expect(() => b.capture({ distinctId: 'u', event: 'd', timestamp: 'yesterday' })).toThrow(/invalid timestamp/);
    await b.flush();
    expect(events().map((e) => e.timestamp)).toEqual(['2026-11-01T10:00:00.000Z', '2026-11-01T10:00:00.000Z', '2026-11-01T10:00:00.000Z']);
    expect(events()[2]!.event_id).toBe('0b6e4d1e-7c1f-4c51-9d55-6a0f7c1b2a3d');
  });

  it('passes session, url, referrer and groups through', async () => {
    const b = client();
    b.capture({ distinctId: 'u', event: 'x', sessionId: 's-1', url: 'https://shop.example/p', referrer: 'https://a.example/', groups: { company: 'acme' } });
    await b.flush();
    expect(events()[0]).toMatchObject({ session_id: 's-1', url: 'https://shop.example/p', referrer: 'https://a.example/', groups: { company: 'acme' } });
  });
});

describe('batching', () => {
  it('sends when flushAt events are queued, in batches of at most flushAt', async () => {
    const b = client({ flushAt: 3, flushInterval: 60_000 });
    for (let i = 0; i < 2; i++) b.capture({ distinctId: 'u', event: `e${i}` });
    await new Promise((r) => setTimeout(r, 30));
    expect(requests).toHaveLength(0);
    expect(b.queued).toBe(2);
    for (let i = 2; i < 7; i++) b.capture({ distinctId: 'u', event: `e${i}` });
    await b.flush();
    expect(requests.map((r) => r.body.batch.length)).toEqual([3, 3, 1]);
    expect(events().map((e) => e.event)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6']);
  });

  it('sends after flushInterval', async () => {
    const b = client({ flushInterval: 20 });
    b.capture({ distinctId: 'u', event: 'later' });
    await vi.waitFor(() => expect(requests).toHaveLength(1));
  });

  it('drops the oldest events beyond maxQueueSize', async () => {
    const onError = vi.fn();
    const b = client({ maxQueueSize: 2, flushAt: 100, onError });
    for (const n of ['a', 'b', 'c']) b.capture({ distinctId: 'u', event: n });
    expect(onError).toHaveBeenCalledWith(expect.any(BeatsError), [expect.objectContaining({ event: 'a' })]);
    await b.flush();
    expect(events().map((e) => e.event)).toEqual(['b', 'c']);
  });

  it('shutdown sends everything and ignores later calls', async () => {
    const b = client({ flushInterval: 60_000 });
    b.capture({ distinctId: 'u', event: 'last' });
    await b.shutdown();
    b.capture({ distinctId: 'u', event: 'after' });
    await b.flush();
    expect(events().map((e) => e.event)).toEqual(['last']);
  });

  it('disabled sends nothing', async () => {
    const b = client({ disabled: true });
    b.capture({ distinctId: 'u', event: 'x' });
    await b.flush();
    expect(requests).toHaveLength(0);
  });
});

describe('retries', () => {
  it('retries 5xx and 429 with the same event ids (idempotent) and then succeeds', async () => {
    respond = (_r, n) => (n === 1 ? { status: 503 } : n === 2 ? { status: 429, headers: { 'retry-after': '0' } } : { status: 202 });
    const b = client();
    const id = b.capture({ distinctId: 'u', event: 'x' });
    await b.flush();
    expect(requests).toHaveLength(3);
    expect(requests.map((r) => r.body.batch[0]!.event_id)).toEqual([id, id, id]);
  });

  it('gives up after maxRetries and reports the events', async () => {
    respond = () => ({ status: 500 });
    const onError = vi.fn();
    const b = client({ maxRetries: 2, onError });
    b.capture({ distinctId: 'u', event: 'x' });
    await b.flush();
    expect(requests).toHaveLength(3);
    expect(onError).toHaveBeenCalledOnce();
    const [err, batch] = onError.mock.calls[0]!;
    expect(err).toBeInstanceOf(BeatsError);
    expect(err.status).toBe(500);
    expect(batch).toHaveLength(1);
  });

  it('does not retry other client errors', async () => {
    respond = () => ({ status: 401 });
    const onError = vi.fn();
    const b = client({ onError });
    b.capture({ distinctId: 'u', event: 'x' });
    await b.flush();
    expect(requests).toHaveLength(1);
    expect(onError.mock.calls[0]![0].message).toBe('HTTP 401: error');
  });

  it('retries timeouts and network errors', async () => {
    respond = (_r, n) => (n === 1 ? { status: 202, delay: 300 } : { status: 202 });
    const b = client({ timeout: 50 });
    b.capture({ distinctId: 'u', event: 'x' });
    await b.flush();
    expect(requests.length).toBeGreaterThanOrEqual(2);

    const onError = vi.fn();
    const offline = new Beats({ key: 'k', host: 'http://127.0.0.1:1', flushOnExit: false, retryDelay: 1, maxRetries: 1, onError });
    offline.capture({ distinctId: 'u', event: 'x' });
    await offline.flush();
    expect(onError.mock.calls[0]![0].status).toBe(0);
  });

  it('uses a custom fetch', async () => {
    const f = vi.fn(async () => new Response(null, { status: 200 }));
    const b = new Beats({ key: 'k', host: 'https://beats.example.com/', fetch: f as typeof fetch, flushOnExit: false });
    b.capture({ distinctId: 'u', event: 'x' });
    await b.flush();
    expect(f).toHaveBeenCalledWith('https://beats.example.com/api/v1/events', expect.objectContaining({ method: 'POST' }));
  });
});

describe('people, groups and features', () => {
  it('sends $identify, $set, $group and $feature_used', async () => {
    const b = client();
    b.identify({ distinctId: 'user-1', anonymousId: 'anon-1', properties: { plan: 'pro' }, setOnce: { signup_source: 'ads' } });
    b.setPersonProperties('user-1', { plan: 'team' });
    b.group({ distinctId: 'user-1', type: 'company', key: 'acme-gmbh', properties: { name: 'ACME GmbH' } });
    b.featureUsed('user-1', 'export', 'csv');
    await b.flush();
    expect(events().map(({ event, properties, groups }) => ({ event, properties, groups }))).toEqual([
      { event: '$identify', properties: { $anon_distinct_id: 'anon-1', $set: { plan: 'pro' }, $set_once: { signup_source: 'ads' } } },
      { event: '$set', properties: { $set: { plan: 'team' } } },
      {
        event: '$group',
        properties: { $group_type: 'company', $group_key: 'acme-gmbh', $group_set: { name: 'ACME GmbH' } },
        groups: { company: 'acme-gmbh' },
      },
      { event: '$feature_used', properties: { $feature: 'export', $variant: 'csv' } },
    ]);
  });
});

describe('e-commerce', () => {
  for (const c of golden) {
    it(`${c.helper} sends the golden payload`, async () => {
      const b = client({ currency: c.defaults?.currency });
      (b[c.helper as CommerceHelper] as (d: string, i: unknown) => string)('customer-7', c.input);
      await b.flush();
      expect(events()).toHaveLength(1);
      const e = events()[0]!;
      expect({ event: e.event, properties: e.properties }).toEqual(c.expected);
      expect(e.distinct_id).toBe('customer-7');
    });
  }

  it('records a server-side order and refund with their own timestamps', async () => {
    const warnings: string[] = [];
    const b = client({ onWarning: (w) => warnings.push(w) });
    b.orderCompleted(
      'customer-7',
      { order_id: 'o-1', revenue: '99.90', currency: 'EUR', items: [{ sku: 'a', price: 99.9 }] },
      { timestamp: '2026-11-01T09:00:00Z', eventId: '9f0c6c55-1b55-4a55-8e55-0a55e55f5555' },
    );
    b.orderRefunded('customer-7', { order_id: 'o-1', revenue: 99.9, currency: 'EUR' });
    b.orderCompleted('customer-7', { revenue: 1 } as never);
    await b.flush();
    expect(events().map((e) => [e.event, e.properties!.order_id, e.properties!.revenue])).toEqual([
      ['$order_completed', 'o-1', '99.90'],
      ['$order_refunded', 'o-1', '99.90'],
      ['$order_completed', undefined, '1.00'],
    ]);
    expect(events()[0]).toMatchObject({ timestamp: '2026-11-01T09:00:00.000Z', event_id: '9f0c6c55-1b55-4a55-8e55-0a55e55f5555' });
    expect(warnings).toEqual(['$order_completed: amounts without a currency', '$order_completed: order_id is required']);
  });
});

describe('process exit', () => {
  const coreDist = fileURLToPath(new URL('../../core/dist/index.js', import.meta.url));

  it.skipIf(!existsSync(coreDist))('flushes queued events when the event loop is about to exit', async () => {
    const src = fileURLToPath(new URL('../src/index.ts', import.meta.url));
    const script = `
      const { Beats } = await import(${JSON.stringify(src)});
      const b = new Beats({ key: 'k', host: ${JSON.stringify(host)}, flushInterval: 60000 });
      b.capture({ distinctId: 'u', event: 'at-exit' });`;
    await promisify(execFile)(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', script]);
    expect(events().map((e) => e.event)).toEqual(['at-exit']);
  });
});
