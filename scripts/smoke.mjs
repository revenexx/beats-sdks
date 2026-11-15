// Loads the built packages that run on Node.js (ESM and CommonJS) and sends
// one batch with the Node.js client to a local server. Runs on every Node.js
// in the CI matrix, including 18, where the test tools do not run.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';

const require = createRequire(import.meta.url);
const dist = (pkg, file) => new URL(`../packages/${pkg}/dist/${file}`, import.meta.url).pathname;

const core = await import(dist('core', 'index.js'));
const coreCjs = require(dist('core', 'index.cjs'));
const { Beats } = await import(dist('node', 'index.js'));
const { Beats: BeatsCjs } = require(dist('node', 'index.cjs'));
for (const [name, value] of [['core (ESM)', core.buildCommerce], ['core (CJS)', coreCjs.buildCommerce], ['node (CJS)', BeatsCjs]]) {
  if (typeof value !== 'function') throw new Error(`${name} did not load`);
}

const bodies = [];
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    bodies.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const host = `http://127.0.0.1:${server.address().port}`;

const beats = new Beats({ key: 'bk_smoke', host, flushOnExit: false });
beats.capture({ distinctId: 'u-1', event: 'smoke' });
beats.orderCompleted('u-1', { order_id: 'A-1', revenue: 10, currency: 'EUR', items: [{ sku: 'S', price: 10 }] });
await beats.shutdown();
server.close();

const events = bodies.flatMap((b) => b.body.events);
if (bodies[0]?.url !== '/api/v1/events' || bodies[0]?.auth !== 'Bearer bk_smoke' || events.length !== 2) {
  throw new Error(`unexpected requests: ${JSON.stringify(bodies)}`);
}
console.log(`ok Node.js ${process.version}: packages load, ${events.length} events sent`);
