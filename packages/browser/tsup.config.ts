import { defineConfig, type Options } from 'tsup';

// Script-tag builds: everything bundled (the core from source, so that its
// constants are inlined), minified with terser; internal properties start
// with `_` and are shortened.
const iife = (entry: string, name: string): Options => ({
  entry: { [name]: entry },
  format: ['iife'],
  target: 'es2020',
  platform: 'browser',
  noExternal: [/.*/],
  outExtension: () => ({ js: '.js' }),
  define: { __BEATS_NPM__: 'false' },
  minify: 'terser',
  terserOptions: {
    ecma: 2020,
    toplevel: true,
    compress: { passes: 3, unsafe: true, unsafe_arrows: true, pure_getters: true },
    mangle: { properties: { regex: /^_/ } },
    format: { comments: false },
  },
  async onSuccess() {
    // the bundle does not depend on strict mode; the directive only costs bytes
    const { readFile, writeFile } = await import('node:fs/promises');
    const file = `dist/${name}.js`;
    await writeFile(file, (await readFile(file, 'utf8')).replace(/^"use strict";/, ''));
  },
  esbuildOptions(o) {
    o.alias = { '@beats-analytics/core': '../core/src/index.ts' };
  },
});

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/lite.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    target: 'es2020',
    define: { __BEATS_NPM__: 'true' },
  },
  iife('src/iife-min.ts', 'beats'),
  iife('src/iife-full.ts', 'beats.full'),
]);
