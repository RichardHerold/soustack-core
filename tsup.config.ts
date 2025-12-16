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
    clean: true,
    splitting: false,
    outDir: 'dist',
    platform: 'browser',
    target: 'es2019',
    external: ['ajv', 'ajv-formats', 'zod']
  },
  {
    ...shared,
    entry: { scrape: 'src/scrape.ts' },
    format: ['cjs', 'esm'],
    dts: { entry: { scrape: 'src/scrape.ts' } },
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
    splitting: false,
    outDir: 'dist',
    platform: 'node',
    target: 'node18',
    banner: {
      js: '#!/usr/bin/env node'
    },
    external: ['ajv', 'ajv-formats', 'cheerio', 'zod']
  }
]);
