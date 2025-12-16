import { spawnSync, SpawnSyncOptions, execSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { statSync } from 'fs';

const CLI_PATH = path.join(__dirname, '..', 'bin', 'cli.ts');
const DIST_CLI_PATH = path.join(__dirname, '..', 'dist', 'cli', 'index.js');
const VALID_FIXTURE = path.join(__dirname, 'fixtures', 'cli', 'valid.soustack.json');
const INVALID_FIXTURE = path.join(__dirname, 'fixtures', 'cli', 'invalid.soustack.invalid.json');

function runCli(args: string[], options: SpawnSyncOptions = {}) {
  const entrypoint = existsSync(DIST_CLI_PATH) ? DIST_CLI_PATH : CLI_PATH;
  const result = spawnSync('node', [entrypoint, ...args], {
    encoding: 'utf-8',
    ...options,
  });
  return result;
}

function expectNonZero(status: number | null) {
  expect(status).not.toBeNull();
  expect(status).not.toBe(0);
}

// Run this test suite sequentially to avoid parallel build conflicts  
describe('soustack CLI', () => {
  beforeAll(() => {
    const distCli = path.join(__dirname, '..', 'dist', 'cli', 'index.js');
    const distIndex = path.join(__dirname, '..', 'dist', 'index.js');
    
    // Skip build if both CLI and main index exist and are recent (within last 10 seconds)
    // This prevents parallel builds from interfering with each other
    if (existsSync(distCli) && existsSync(distIndex)) {
      try {
        const stats = statSync(distCli);
        const age = Date.now() - stats.mtimeMs;
        if (age < 10000) {
          return; // Build is fresh, skip
        }
      } catch {
        // If stat fails, proceed with build
      }
    }
    
    // Always rebuild to ensure we have the latest code
    try {
      execSync('npm run build', { stdio: 'pipe' });
    } catch (error: any) {
      // If build fails but CLI exists, continue (might be a race condition)
      if (existsSync(distCli) && existsSync(distIndex)) {
        return;
      }
      throw error;
    }
  });

  it('validates a known good fixture successfully', () => {
    const result = runCli(['validate', VALID_FIXTURE]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('✅');
  });

  it('returns a non-zero exit code for invalid fixtures', () => {
    const result = runCli(['validate', INVALID_FIXTURE]);
    expectNonZero(result.status);
    expect(`${result.stdout}${result.stderr ?? ''}`).toMatch(/❌|Validation/);
  });

  it('fails soustack test when repository contains invalid recipes', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'soustack-cli-'));
    const validPath = path.join(tmp, 'valid.soustack.json');
    const invalidPath = path.join(tmp, 'invalid.soustack.json');

    writeFileSync(validPath, readFileSync(VALID_FIXTURE, 'utf-8'));
    writeFileSync(
      invalidPath,
      JSON.stringify(
        {
          name: 'Bad File',
          ingredients: [{ item: 'Flour', quantity: 2, unit: 'cups' }],
        },
        null,
        2,
      ),
      'utf-8',
    );

    const result = runCli(['test'], { cwd: tmp });
    expectNonZero(result.status);
    expect(result.stdout).toContain('Test summary');
    expect(result.stdout).toContain('❌');
  });
});
