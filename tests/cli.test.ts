import { spawnSync, SpawnSyncOptions } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';

const DIST_CLI_PATH = path.join(__dirname, '..', 'dist', 'cli', 'index.js');
const VALID_FIXTURE = path.join(__dirname, 'fixtures', 'cli', 'valid.soustack.json');
const INVALID_FIXTURE = path.join(__dirname, 'fixtures', 'cli', 'invalid.soustack.invalid.json');

function runCli(args: string[], options: SpawnSyncOptions = {}) {
  // #region agent log
  fetch('http://127.0.0.1:7255/ingest/4f34f152-5cff-4133-a069-6f90159cb43b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'cli.test.ts:10',message:'runCli entry',data:{distCliPath:DIST_CLI_PATH,__dirname:__dirname,resolvedPath:path.resolve(DIST_CLI_PATH),exists:existsSync(DIST_CLI_PATH)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  // #region agent log
  fetch('http://127.0.0.1:7255/ingest/4f34f152-5cff-4133-a069-6f90159cb43b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'cli.test.ts:11',message:'checking file existence',data:{path:DIST_CLI_PATH,exists:existsSync(DIST_CLI_PATH),absolutePath:path.resolve(DIST_CLI_PATH)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  if (!existsSync(DIST_CLI_PATH)) {
    // #region agent log
    fetch('http://127.0.0.1:7255/ingest/4f34f152-5cff-4133-a069-6f90159cb43b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'cli.test.ts:12',message:'file missing error',data:{path:DIST_CLI_PATH,resolved:path.resolve(DIST_CLI_PATH),cwd:process.cwd()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
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
  // #region agent log
  beforeAll(() => {
    fetch('http://127.0.0.1:7255/ingest/4f34f152-5cff-4133-a069-6f90159cb43b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'cli.test.ts:28',message:'beforeAll hook',data:{distCliPath:DIST_CLI_PATH,exists:existsSync(DIST_CLI_PATH),cwd:process.cwd(),__dirname:__dirname},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  });
  // #endregion
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

  it('fails validation when forcing an incompatible profile', () => {
    const result = runCli(['validate', VALID_FIXTURE, '--profile', 'base', '--force-profile']);
    expectNonZero(result.status);
    expect(`${result.stdout}${result.stderr ?? ''}`).toMatch(/Schema errors/i);
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

  it('prints a stable JSON conformance report for valid fixtures', () => {
    const result = runCli(['check', VALID_FIXTURE, '--json']);
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.toString());
    expect(output).toMatchInlineSnapshot(`
{
  "conformanceIssues": [],
  "ok": true,
  "schemaErrors": [],
  "stacks": {},
  "warnings": [],
}
`);
  });

  it('prints a stable JSON conformance report for invalid fixtures', () => {
    const result = runCli(['check', INVALID_FIXTURE, '--json']);
    expectNonZero(result.status);
    const output = JSON.parse(result.stdout.toString());
    expect(output).toMatchInlineSnapshot(`
{
  "conformanceIssues": [],
  "ok": false,
  "schemaErrors": [
    {
      "keyword": "required",
      "message": "must have required property 'instructions'",
      "path": "/",
    },
    {
      "keyword": "required",
      "message": "must have required property 'name'",
      "path": "/ingredients/0",
    },
    {
      "keyword": "required",
      "message": "must have required property 'section'",
      "path": "/ingredients/0",
    },
    {
      "keyword": "required",
      "message": "must have required property 'ingredients'",
      "path": "/ingredients/0",
    },
  ],
  "stacks": {},
  "warnings": [],
}
`);
  });

  it('ingest command shows helpful error when @soustack/ingest is not installed', () => {
    const result = runCli(['ingest', './file.txt', '--out', './out']);

    expectNonZero(result.status);
    const output = `${result.stdout}${result.stderr ?? ''}`;
    expect(output).toContain('soustack ingest requires @soustack/ingest');
    expect(output).toContain('npm i -D @soustack/ingest');
    expect(output).toContain('npx @soustack/ingest ingest');
  });
});
