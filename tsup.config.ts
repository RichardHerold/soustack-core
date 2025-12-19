import { defineConfig } from 'tsup';

const shared = {
  sourcemap: true,
  minify: false,
  treeshake: true,
  skipNodeModulesBundle: true,
  clean: false
};

export default defineConfig([
  {
    ...shared,
    entry: { index: 'src/index.ts' },
    format: ['cjs', 'esm'],
    dts: { entry: { index: 'src/index.ts' } },
    clean: true, // Only clean on first entry
    splitting: false,
    outDir: 'dist',
    platform: 'browser',
    target: 'es2019',
    external: ['ajv', 'ajv-formats', 'zod']
  },
  {
    ...shared,
    entry: { 'scrape/index': 'src/scrape/index.ts' },
    format: ['cjs', 'esm'],
    dts: { entry: { 'scrape/index': 'src/scrape/index.ts' } },
    clean: false,
    splitting: false,
    outDir: 'dist',
    platform: 'node',
    target: 'node18',
    external: ['ajv', 'ajv-formats', 'cheerio', 'zod']
  },
  {
    ...shared,
    entry: { 'cli/index': 'bin/cli.ts' },
    format: ['cjs'],
    dts: false,
    clean: false, // Explicitly don't clean on subsequent entries
    splitting: false,
    outDir: 'dist',
    platform: 'node',
    target: 'node18',
    banner: {
      js: '#!/usr/bin/env node'
    },
    external: ['ajv', 'ajv-formats', 'cheerio', 'zod', 'glob']
  }
]);
