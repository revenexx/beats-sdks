// Checks what npm will ship, after `pnpm run build`: publint (manifest,
// exports, files) and Are the Types Wrong (types for ESM, CJS and bundlers).
// node10 resolution is not supported: every package needs Node.js 18+ or a
// bundler. The script-tag builds of the browser client are plain files
// without types, so they are left out of the type check.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const exclude = { browser: ['beats.js', 'beats.full.js'] };
let failed = false;

for (const name of readdirSync(new URL('packages/', root))) {
  const dir = `packages/${name}`;
  const run = (cmd, args) => {
    try {
      execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });
    } catch {
      failed = true;
      console.error(`FAIL ${cmd} ${args.join(' ')}`);
    }
  };
  run('pnpm', ['exec', 'publint', '--strict', dir]);
  const ex = exclude[name] ? ['--exclude-entrypoints', ...exclude[name]] : [];
  run('pnpm', ['exec', 'attw', '--pack', dir, '--profile', 'node16', '--format', 'ascii', ...ex]);
}
process.exit(failed ? 1 : 0);
