import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/module.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    target: 'es2022',
    external: ['@nuxt/kit', '@nuxt/schema'],
    async onSuccess() {
      const { readFile, appendFile } = await import('node:fs/promises');
      const augment = await readFile('src/augment.d.ts', 'utf8');
      // dts files are written after onSuccess in some tsup versions; wait for them
      for (const f of ['dist/module.d.ts', 'dist/module.d.cts']) {
        for (let i = 0; i < 100; i++) {
          try {
            const cur = await readFile(f, 'utf8');
            if (!cur.includes("declare module '#app'")) await appendFile(f, `\n${augment}`);
            break;
          } catch {
            await new Promise((r) => setTimeout(r, 100));
          }
        }
      }
    },
  },
  {
    // runtime files are compiled by the Nuxt app's bundler, which resolves #app
    entry: ['src/runtime/plugin.client.ts', 'src/runtime/composables.ts'],
    outDir: 'dist/runtime',
    format: ['esm'],
    dts: false,
    target: 'es2020',
    bundle: false,
    external: ['#app', '@beats-analytics/browser', '@beats-analytics/vue'],
  },
]);
