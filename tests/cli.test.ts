import { spawnSync, SpawnSyncOptions } from 'child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';

const DIST_CLI_PATH = path.join(__dirname, '..', 'dist', 'bin', 'cli.js');
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

  it('packs recipe files with deterministic ordering', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'soustack-pack-'));
    const dirA = path.join(tmp, 'a');
    const dirB = path.join(tmp, 'b');
    mkdirSync(dirA);
    mkdirSync(dirB);

    const recipe = (name: string) => ({
      name,
      profile: 'base',
      stacks: {},
      ingredients: [],
      instructions: [],
    });

    writeFileSync(path.join(dirA, 'a.soustack.json'), JSON.stringify(recipe('a'), null, 2), 'utf-8');
    writeFileSync(path.join(dirB, 'z.json'), JSON.stringify(recipe('z'), null, 2), 'utf-8');
    writeFileSync(path.join(tmp, 'root.json'), JSON.stringify(recipe('root'), null, 2), 'utf-8');
    writeFileSync(path.join(tmp, 'skip.json'), JSON.stringify({ name: 'skip' }, null, 2), 'utf-8');
    writeFileSync(path.join(tmp, 'bad.json'), '{not json', 'utf-8');

    const outputPath = path.join(tmp, 'out.pack.json');
    const result = runCli(['pack', tmp, '-o', outputPath]);

    expect(result.status).toBe(0);
    const packed = JSON.parse(readFileSync(outputPath, 'utf-8')) as {
      recipes: Array<{ name?: unknown }>;
      meta: { count: number; source?: string; packedAt: string };
    };

    expect(packed.meta.count).toBe(3);
    expect(packed.meta.source).toBe(path.resolve(tmp));
    expect(typeof packed.meta.packedAt).toBe('string');
    const names = packed.recipes.map((entry) => (typeof entry.name === 'string' ? entry.name : ''));
    expect(names).toEqual(['a', 'z', 'root']);
  });

  it('packs recipes from zip archives deterministically', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'soustack-pack-zip-'));
    const zipBase64 =
      'UEsDBBQAAAAIAKN9OlzbrmOMRAAAAEwAAAAPAAAAYS5zb3VzdGFjay5qc29uq1bKS8xNVbJSSlTSUSooyk/LzAHxkhKLU4ECxSWJydnFSlbVtTpKmXnpRakpmal5JUCB6FiQQHFJUWlySWZ+HlikFgBQSwMEFAAAAAgAo306XOR2ZtpGAAAATwAAAAsAAABiL3Jvb3QuanNvbh3IsQ2AMAwEwF2+zgSsgihCMMgCbGSbKsruJFx5FZJvwgRTDSQ8pjtfI9bs1MMjl9Mx1ZbAchhtTBI95mWEh70lWOWf9gFQSwMEFAAAAAgAo306XCxOuNARAAAADwAAAAkAAABza2lwLmpzb26rVspLzE1VslIqzs4sUKoFAFBLAQIUAxQAAAAIAKN9OlzbrmOMRAAAAEwAAAAPAAAAAAAAAAAAAACAAQAAAABhLnNvdXN0YWNrLmpzb25QSwECFAMUAAAACACjfTpc5HZm2kYAAABPAAAACwAAAAAAAAAAAAAAgAFxAAAAYi9yb290Lmpzb25QSwECFAMUAAAACACjfTpcLE640BEAAAAPAAAACQAAAAAAAAAAAAAAgAHgAAAAc2tpcC5qc29uUEsFBgAAAAADAAMArQAAABgBAAAAAA==';
    const zipPath = path.join(tmp, 'recipes.zip');
    writeFileSync(zipPath, Buffer.from(zipBase64, 'base64'));

    const outputPath = path.join(tmp, 'out.pack.json');
    const result = runCli(['pack', zipPath, '-o', outputPath]);

    expect(result.status).toBe(0);
    const packed = JSON.parse(readFileSync(outputPath, 'utf-8')) as {
      recipes: Array<{ name?: unknown }>;
      meta: { count: number; source?: string; packedAt: string };
    };

    expect(packed.meta.count).toBe(2);
    expect(packed.meta.source).toBe(path.resolve(zipPath));
    expect(typeof packed.meta.packedAt).toBe('string');
    const names = packed.recipes.map((entry) => (typeof entry.name === 'string' ? entry.name : ''));
    expect(names).toEqual(['a', 'root']);
  });

  it('ingest command shows helpful error when @soustack/ingest is not installed', () => {
    const result = runCli(['ingest', './file.txt', '--out', './out']);

    expectNonZero(result.status);
    const output = `${result.stdout}${result.stderr ?? ''}`;
    expect(output).toContain('soustack ingest requires @soustack/ingest');
    expect(output).toContain('npm i -D @soustack/ingest');
    expect(output).toContain('npx @soustack/ingest ingest');
  });

  it('--help output includes delimited commands section', () => {
    const result = runCli(['--help']);
    const output = `${result.stdout}${result.stderr ?? ''}`;

    expect(output).toContain('--- COMMANDS BEGIN ---');
    expect(output).toContain('--- COMMANDS END ---');
    expect(output).toContain('validate');
    expect(output).toContain('Commands:');
  });

  it('scale --help exits 0 and shows usage', () => {
    const result = runCli(['scale', '--help']);
    expect(result.status).toBe(0);
    const output = `${result.stdout}${result.stderr ?? ''}`;
    expect(output).toContain('Usage: soustack scale');
    expect(output).toContain('multiplier');
  });

  it('scale -h exits 0 and shows usage', () => {
    const result = runCli(['scale', '-h']);
    expect(result.status).toBe(0);
    const output = `${result.stdout}${result.stderr ?? ''}`;
    expect(output).toContain('Usage: soustack scale');
  });

  it('scrape --help exits 0 and shows usage', () => {
    const result = runCli(['scrape', '--help']);
    expect(result.status).toBe(0);
    const output = `${result.stdout}${result.stderr ?? ''}`;
    expect(output).toContain('Usage: soustack scrape');
    expect(output).toContain('url');
  });

  it('scrape -h exits 0 and shows usage', () => {
    const result = runCli(['scrape', '-h']);
    expect(result.status).toBe(0);
    const output = `${result.stdout}${result.stderr ?? ''}`;
    expect(output).toContain('Usage: soustack scrape');
  });

  it('check --help exits 0 and shows usage', () => {
    const result = runCli(['check', '--help']);
    expect(result.status).toBe(0);
    const output = `${result.stdout}${result.stderr ?? ''}`;
    expect(output).toContain('Usage: soustack check');
    expect(output).toContain('--json');
  });

  it('check -h exits 0 and shows usage', () => {
    const result = runCli(['check', '-h']);
    expect(result.status).toBe(0);
    const output = `${result.stdout}${result.stderr ?? ''}`;
    expect(output).toContain('Usage: soustack check');
  });

  it('validate --help exits 0 and shows usage', () => {
    const result = runCli(['validate', '--help']);
    expect(result.status).toBe(0);
    const output = `${result.stdout}${result.stderr ?? ''}`;
    expect(output).toContain('Usage: soustack validate');
    expect(output).toContain('--profile');
  });

  it('validate -h exits 0 and shows usage', () => {
    const result = runCli(['validate', '-h']);
    expect(result.status).toBe(0);
    const output = `${result.stdout}${result.stderr ?? ''}`;
    expect(output).toContain('Usage: soustack validate');
  });

  it('test --help exits 0 and shows usage', () => {
    const result = runCli(['test', '--help']);
    expect(result.status).toBe(0);
    const output = `${result.stdout}${result.stderr ?? ''}`;
    expect(output).toContain('Usage: soustack test');
    expect(output).toContain('--profile');
  });

  it('test -h exits 0 and shows usage', () => {
    const result = runCli(['test', '-h']);
    expect(result.status).toBe(0);
    const output = `${result.stdout}${result.stderr ?? ''}`;
    expect(output).toContain('Usage: soustack test');
  });

  it('convert --help exits 0 and shows usage', () => {
    const result = runCli(['convert', '--help']);
    expect(result.status).toBe(0);
    const output = `${result.stdout}${result.stderr ?? ''}`;
    expect(output).toContain('Usage: soustack convert');
    expect(output).toContain('--from');
    expect(output).toContain('--to');
  });

  it('convert -h exits 0 and shows usage', () => {
    const result = runCli(['convert', '-h']);
    expect(result.status).toBe(0);
    const output = `${result.stdout}${result.stderr ?? ''}`;
    expect(output).toContain('Usage: soustack convert');
  });

  it('import --help exits 0 and shows usage', () => {
    const result = runCli(['import', '--help']);
    expect(result.status).toBe(0);
    const output = `${result.stdout}${result.stderr ?? ''}`;
    expect(output).toContain('Usage: soustack import');
    expect(output).toContain('--url');
  });

  it('import -h exits 0 and shows usage', () => {
    const result = runCli(['import', '-h']);
    expect(result.status).toBe(0);
    const output = `${result.stdout}${result.stderr ?? ''}`;
    expect(output).toContain('Usage: soustack import');
  });

  it('ingest --help exits 0 and shows usage', () => {
    const result = runCli(['ingest', '--help']);
    expect(result.status).toBe(0);
    const output = `${result.stdout}${result.stderr ?? ''}`;
    expect(output).toContain('Usage: soustack ingest');
    expect(output).toContain('--out');
  });

  it('ingest -h exits 0 and shows usage', () => {
    const result = runCli(['ingest', '-h']);
    expect(result.status).toBe(0);
    const output = `${result.stdout}${result.stderr ?? ''}`;
    expect(output).toContain('Usage: soustack ingest');
  });

  it('pack --help exits 0 and shows usage', () => {
    const result = runCli(['pack', '--help']);
    expect(result.status).toBe(0);
    const output = `${result.stdout}${result.stderr ?? ''}`;
    expect(output).toContain('Usage: soustack pack');
    expect(output).toContain('soustack-recipes.pack.json');
  });

  it('pack -h exits 0 and shows usage', () => {
    const result = runCli(['pack', '-h']);
    expect(result.status).toBe(0);
    const output = `${result.stdout}${result.stderr ?? ''}`;
    expect(output).toContain('Usage: soustack pack');
  });
});
