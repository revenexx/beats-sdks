import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  target: 'es2020',
  external: ['react', '@revenexx/beats-browser'],
  // the provider can be imported from Next.js server components (app router)
  banner: { js: "'use client';" },
});
