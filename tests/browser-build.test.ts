import { readFileSync, existsSync } from 'fs';
import path from 'path';

describe('browser build', () => {
  it('does not pull node-only built-ins', () => {
    const distDir = path.resolve(__dirname, '..', 'dist');
    const outputs = ['index.browser.js', 'index.browser.mjs'];

    for (const file of outputs) {
      const full = path.join(distDir, file);
      expect(existsSync(full)).toBe(true); // build should have produced this
      const content = readFileSync(full, 'utf8');

      const forbidden =
        /(require\(["'](?:fs|path|undici)["']\)|from ["'](?:fs|path|undici)["']|node:(?:fs|path))/;
      expect(content).not.toMatch(forbidden);
    }
  });
});
