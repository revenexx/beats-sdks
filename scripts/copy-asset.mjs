// Copies the script-tag builds to the ingestion crate, which serves them:
// beats.js (minimal) and beats.full.js (full).
import { copyFileSync, mkdirSync } from 'node:fs';

const from = new URL('../packages/browser/dist/', import.meta.url);
const to = new URL('../../crates/beats-ingest/assets/', import.meta.url);
mkdirSync(to, { recursive: true });
for (const file of ['beats.js', 'beats.full.js']) {
  copyFileSync(new URL(file, from), new URL(file, to));
  console.log(`copied ${file} to crates/beats-ingest/assets/${file}`);
}
