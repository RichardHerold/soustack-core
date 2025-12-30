import { validateRecipe } from '../src/validator';
import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

const FIXTURES_ROOT = path.join(__dirname, '..', 'spec', 'fixtures');

type ValidationError = {
  path: string;
  message: string;
  keyword?: string;
};

function normalizeFixture(fixture: Record<string, unknown>): Record<string, unknown> {
  if (fixture['@type']) {
    return fixture;
  }

  return {
    ...fixture,
    '@type': 'Recipe',
  };
}

function findFixtureFiles(kind: 'valid' | 'invalid'): string[] {
  // Fixtures are discovered by filename pattern: .valid. or .invalid.
  // Search recursively under spec/fixtures/**
  // Pattern matches files containing .valid. or .invalid. in the filename
  // Use a more specific pattern to avoid matching "invalid" when looking for "valid"
  const pattern = kind === 'valid' 
    ? path.join(FIXTURES_ROOT, '**', '*.valid.json')
    : path.join(FIXTURES_ROOT, '**', '*.invalid.json');
  
  const matches = globSync(pattern, { absolute: true, nodir: true });
  return matches.sort();
}

function formatErrors(fixturePath: string, errors: ValidationError[], maxErrors = 3): string {
  const relativePath = path.relative(process.cwd(), fixturePath);
  const displayedErrors = errors.slice(0, maxErrors);
  const remaining = errors.length - displayedErrors.length;

  const lines = displayedErrors.map((error, index) => {
    const keyword = error.keyword ? ` (${error.keyword})` : '';
    return `  ${index + 1}. [${error.path}] ${error.message}${keyword}`;
  });

  if (remaining > 0) {
    lines.push(`  ... and ${remaining} more error(s)`);
  }

  return `\nFixture: ${relativePath}\nErrors (${errors.length}):\n${lines.join('\n')}`;
}

function collectErrors(result: ReturnType<typeof validateRecipe>): ValidationError[] {
  const combined: ValidationError[] = [
    ...result.schemaErrors.map((error) => ({
      path: error.path,
      message: error.message,
      keyword: error.keyword,
    })),
    ...result.conformanceIssues.map((issue) => ({
      path: issue.path,
      message: issue.message,
      keyword: issue.code,
    })),
  ];

  return combined.sort((a, b) => {
    const pathCompare = a.path.localeCompare(b.path);
    if (pathCompare !== 0) return pathCompare;
    const messageCompare = a.message.localeCompare(b.message);
    if (messageCompare !== 0) return messageCompare;
    return (a.keyword ?? '').localeCompare(b.keyword ?? '');
  });
}

describe('Spec fixture contract tests', () => {
  const validFixtures = findFixtureFiles('valid');
  const invalidFixtures = findFixtureFiles('invalid');

  it('should have at least one valid and one invalid fixture', () => {
    expect(validFixtures.length).toBeGreaterThan(0);
    expect(invalidFixtures.length).toBeGreaterThan(0);
  });

  describe('valid fixtures', () => {
    it.each(validFixtures.map((fixturePath) => [path.relative(process.cwd(), fixturePath), fixturePath]))(
      'should validate %s',
      (_relativePath, fixturePath) => {
        const fixtureContent = fs.readFileSync(fixturePath, 'utf8');
        const fixture = normalizeFixture(JSON.parse(fixtureContent));
        const result = validateRecipe(fixture, { mode: 'full', collectAllErrors: true });

        if (!result.ok) {
          const combinedErrors = collectErrors(result);
          throw new Error(
            `Expected fixture to be valid but validation failed:${formatErrors(fixturePath, combinedErrors)}`,
          );
        }

        expect(result.ok).toBe(true);
      },
    );
  });

  describe('invalid fixtures', () => {
    it.each(invalidFixtures.map((fixturePath) => [path.relative(process.cwd(), fixturePath), fixturePath]))(
      'should reject %s',
      (_relativePath, fixturePath) => {
        const fixtureContent = fs.readFileSync(fixturePath, 'utf8');
        const fixture = JSON.parse(fixtureContent);
        const result = validateRecipe(fixture, { mode: 'full', collectAllErrors: true });

        if (result.ok) {
          throw new Error('Expected fixture to be invalid but validation passed.');
        }

        const combinedErrors = collectErrors(result);
        expect(result.ok).toBe(false);
        expect(combinedErrors.length).toBeGreaterThan(0);
      },
    );
  });
});
