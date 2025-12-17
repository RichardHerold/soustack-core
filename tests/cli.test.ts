import { spawnSync, SpawnSyncOptions, execSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';

const CLI_PATH = path.join(__dirname, '..', 'bin', 'cli.ts');
const DIST_CLI_PATH = path.join(__dirname, '..', 'dist', 'cli', 'index.js');
const VALID_FIXTURE = path.join(__dirname, 'fixtures', 'cli', 'valid.soustack.json');
const INVALID_FIXTURE = path.join(__dirname, 'fixtures', 'cli', 'invalid.soustack.invalid.json');

const BUILD_LOCK_FILE = path.join(__dirname, '..', '.build-lock');
const MAX_LOCK_WAIT = 30000;
const LOCK_POLL_INTERVAL = 100;

function sleepSync(ms: number) {
  const start = Date.now();
  while (Date.now() - start < ms) {}
}

function acquireLock(): boolean {
  const startTime = Date.now();
  while (Date.now() - startTime < MAX_LOCK_WAIT) {
    try {
      writeFileSync(BUILD_LOCK_FILE, process.pid.toString(), { flag: 'wx' });
      return true;
    } catch (error: any) {
      if (error.code === 'EEXIST') {
        const waitTime = Math.min(LOCK_POLL_INTERVAL, MAX_LOCK_WAIT - (Date.now() - startTime));
        if (waitTime > 0) sleepSync(waitTime);
        continue;
      }
      throw error;
    }
  }
  return false;
}

function releaseLock() {
  try {
    if (existsSync(BUILD_LOCK_FILE)) unlinkSync(BUILD_LOCK_FILE);
  } catch (e) {}
}

function buildDist() {
  const distDir = path.join(__dirname, '..', 'dist');
  const buildOutputs = [
    path.join(distDir, 'index.js'),
    path.join(distDir, 'index.mjs'),
    DIST_CLI_PATH
  ];
  const anyOutputExists = buildOutputs.some(output => existsSync(output));
  if (anyOutputExists) return;
  if (!acquireLock()) {
    sleepSync(500);
    const anyOutputExistsAfterWait = buildOutputs.some(output => existsSync(output));
    if (anyOutputExistsAfterWait) return;
    throw new Error('Failed to acquire build lock - timeout');
  }
  try {
    const anyOutputExistsAfterLock = buildOutputs.some(output => existsSync(output));
    if (anyOutputExistsAfterLock) return;
    execSync('npm run build -- --silent', { encoding: 'utf8', stdio: 'pipe' });
  } finally {
    releaseLock();
  }
}

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

describe('soustack CLI', () => {
  beforeAll(() => {
    buildDist();
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