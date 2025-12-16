import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

function buildDist() {
  execSync('npm run build -- --silent', { stdio: 'inherit' });
}

describe('browser build', () => {
  beforeAll(() => {
    buildDist();
  });

  it('does not pull node-only built-ins', () => {
    const distDir = path.resolve(__dirname, '..', 'dist');
    const outputs = ['index.js', 'index.mjs'];
    const forbidden = /(require\(["'](?:fs|path|undici)["']\)|from ["'](?:fs|path|undici)["']|node:(?:fs|path))/;

    outputs.forEach(file => {
      const content = readFileSync(path.join(distDir, file), 'utf8');
      expect(content).not.toMatch(forbidden);
    });
  });
});
