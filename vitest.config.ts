import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (pkg: string, file = 'index.ts') => fileURLToPath(new URL(`./packages/${pkg}/src/${file}`, import.meta.url));

// Unit tests run against the sources; browser tests run against the built bundles.
const define = { __BEATS_NPM__: 'true' };
const alias = [
  { find: /^@revenexx\/beats-browser\/lite$/, replacement: src('browser', 'lite.ts') },
  { find: /^@revenexx\/beats-(core|browser|node|vue|react|nuxt)$/, replacement: src('$1') },
  { find: /^#app$/, replacement: fileURLToPath(new URL('./packages/nuxt/test/nuxt-app-mock.ts', import.meta.url)) },
];

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        define,
        test: {
          name: 'unit',
          include: ['packages/*/test/**/*.test.{ts,tsx}'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'browser',
          include: ['packages/browser/e2e/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30_000,
          hookTimeout: 30_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
