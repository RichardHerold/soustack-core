import { spawnSync, SpawnSyncOptions } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';

const DIST_CLI_PATH = path.join(__dirname, '..', 'dist', 'cli', 'index.js');
const VALID_FIXTURE = path.join(__dirname, 'fixtures', 'cli', 'valid.soustack.json');
const INVALID_FIXTURE = path.join(__dirname, 'fixtures', 'cli', 'invalid.soustack.invalid.json');

function runCli(args: string[], options: SpawnSyncOptions = {}) {
  if (!existsSync(DIST_CLI_PATH)) {
    throw new Error(
      `Missing built CLI at ${DIST_CLI_PATH}. Build artifacts are required before running tests.`,
    );
  }

  return spawnSync('node', [DIST_CLI_PATH, ...args], {
    encoding: 'utf-8',
    ...options,
  });
}

function expectNonZero(status: number | null) {
  expect(status).not.toBeNull();
  expect(status).not.toBe(0);
}

describe('soustack CLI', () => {
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
