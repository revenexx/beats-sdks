import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Envelope } from '@beats-analytics/core';

export interface Recorded {
  path: string;
  contentType: string;
  key: string;
  consent: boolean;
  events: Envelope[];
}

const dist = new URL('../dist/', import.meta.url);

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

const body = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => resolve(s));
  });

/**
 * Two origins, like a real deployment: the collector (beats: `/beats.js`,
 * `/beats.full.js`, `POST /e`, which records requests) and the site (HTML
 * pages registered with `page`).
 */
export async function startServers() {
  const recorded: Recorded[] = [];
  const pages = new Map<string, string>();

  const collector = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://x');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Headers', 'content-type');
      return res.writeHead(204).end();
    }
    if (req.method === 'POST' && url.pathname === '/e') {
      const parsed = JSON.parse(await body(req));
      recorded.push({ path: url.pathname, contentType: req.headers['content-type'] ?? '', key: parsed.key, consent: parsed.consent, events: parsed.events });
      return res.writeHead(202).end();
    }
    if (url.pathname === '/beats.js' || url.pathname === '/beats.full.js') {
      res.setHeader('Content-Type', 'text/javascript');
      return res.end(readFileSync(new URL(url.pathname.slice(1), dist)));
    }
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><title>Elsewhere</title><p>elsewhere</p>');
  });

  const site = createServer((req, res) => {
    const url = new URL(req.url!, 'http://x');
    const html = pages.get(url.pathname) ?? pages.get('*');
    if (!html) return res.writeHead(404).end();
    res.setHeader('Content-Type', 'text/html');
    res.end(html);
  });

  const collectorUrl = await listen(collector);
  const siteUrl = await listen(site);

  return {
    collectorUrl,
    siteUrl,
    recorded,
    events: () => recorded.flatMap((r) => r.events),
    /** Registers an HTML page on the site (`*` for every path). */
    page(path: string, html: string) {
      pages.set(path, html);
    },
    clear() {
      recorded.length = 0;
      pages.clear();
    },
    close: () => Promise.all([new Promise((r) => collector.close(r)), new Promise((r) => site.close(r))]),
  };
}
