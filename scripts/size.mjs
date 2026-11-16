// Fails when a script-tag build is over its size budget (gzip, level 9).
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const budgets = [
  // 2048 until the privacy defaults (URL cleaning, beforeSend, sanitizeUrl) and the page leave title, which belong in the minimal build too
  ['packages/browser/dist/beats.js', 'minimal (pageviews, SPA, page leave, track, consent)', 2355],
  ['packages/browser/dist/beats.full.js', 'full', 6144],
];

let failed = false;
for (const [file, label, budget] of budgets) {
  const src = readFileSync(new URL(`../${file}`, import.meta.url));
  const gz = gzipSync(src, { level: 9 }).length;
  const ok = gz <= budget;
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${file} (${label}): ${src.length} B, ${gz} B gzip, budget ${budget} B`);
}
process.exit(failed ? 1 : 0);
