// Publishes every package in packages/ to npm, core first (the others depend
// on it). `pnpm pack` replaces the workspace:* ranges with the version; the
// tarball is then published by the npm CLI, which does the trusted
// publishing (OIDC) exchange and signs the provenance statement.
// A version already on npm is skipped, so a re-run after a partial publish
// finishes the rest. Run after `pnpm run build`, in CI only.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const order = ['core', 'browser', 'node', 'vue', 'react', 'nuxt'];
const out = mkdtempSync(join(tmpdir(), 'beats-pack-'));
const dryRun = process.argv.includes('--dry-run');

for (const name of order) {
  const dir = new URL(`../packages/${name}/`, import.meta.url);
  const pkg = JSON.parse(readFileSync(new URL('package.json', dir), 'utf8'));
  const spec = `${pkg.name}@${pkg.version}`;
  let published = false;
  try {
    execFileSync('npm', ['view', spec, 'version'], { stdio: 'pipe' });
    published = true;
  } catch {}
  if (published) {
    console.log(`skip ${spec}: already on npm`);
    continue;
  }
  const file = execFileSync('pnpm', ['pack', '--pack-destination', out], { cwd: dir, encoding: 'utf8' })
    .trim()
    .split('\n')
    .pop();
  const args = ['publish', file, '--access', 'public', '--provenance'];
  if (dryRun) args.push('--dry-run');
  console.log(`npm ${args.join(' ')}`);
  execFileSync('npm', args, { stdio: 'inherit' });
}
