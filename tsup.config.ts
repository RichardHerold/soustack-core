import { defineConfig } from 'tsup';

const shared = {
  target: 'node18',
  sourcemap: true,
  minify: false,
  treeshake: true,
  skipNodeModulesBundle: true,
  clean: false,
  platform: 'node' as const
};

export default defineConfig([
  {
    ...shared,
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    splitting: false,
    outDir: 'dist',
    external: ['ajv', 'ajv-formats', 'cheerio', 'zod']
  },
  {
    ...shared,
    entry: { 'cli/index': 'bin/cli.ts' },
    format: ['cjs'],
    dts: false,
    splitting: false,
    outDir: 'dist',
    banner: {
      js: '#!/usr/bin/env node'
    },
    external: ['ajv', 'ajv-formats', 'cheerio', 'zod']
  }
]);
