import { execSync } from 'child_process';
import { readFileSync, existsSync, statSync } from 'fs';
import path from 'path';

function buildDist() {
  const distIndex = path.resolve(__dirname, '..', 'dist', 'index.js');
  const distIndexMjs = path.resolve(__dirname, '..', 'dist', 'index.mjs');
  
  // Skip build if files already exist and are recent (within last 10 seconds)
  // This prevents parallel builds from interfering with each other
  if (existsSync(distIndex) && existsSync(distIndexMjs)) {
    try {
      const stats = statSync(distIndex);
      const age = Date.now() - stats.mtimeMs;
      if (age < 10000) {
        return; // Build is fresh, skip
      }
    } catch {
      // If stat fails, proceed with build
    }
  }
  
  try {
    execSync('npm run build', { stdio: 'pipe' });
  } catch (error: any) {
    // If build fails but files exist, continue (might be a race condition)
    if (existsSync(distIndex) && existsSync(distIndexMjs)) {
      return;
    }
    throw error;
  }
}

describe('browser build', () => {
  beforeAll(() => {
    buildDist();
  }, 30000); // Increase timeout for build

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
