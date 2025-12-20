import { validateRecipe } from '../src/validator';
import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

const FIXTURES_ROOT = path.join(__dirname, '..', 'spec', 'fixtures');

function findFixtureFiles(kind: 'valid' | 'invalid'): string[] {
  const pattern = path.join(FIXTURES_ROOT, `**/${kind}/**/*.json`);
  return globSync(pattern, { absolute: true, nodir: true });
}

function schemaIdForFixture(fixturePath: string): string {
  const relativePath = path.relative(FIXTURES_ROOT, fixturePath);
  const [profileName] = relativePath.split(path.sep);
  const schemaIds: Record<string, string> = {
    base: 'http://soustack.org/schema/v0.3.0/profiles/base',
    cookable: 'http://soustack.org/schema/v0.3.0/profiles/cookable',
    illustrated: 'http://soustack.org/schema/v0.3.0/profiles/illustrated',
    quantified: 'http://soustack.org/schema/v0.3.0/profiles/quantified',
    scalable: 'http://soustack.org/schema/v0.3.0/profiles/scalable',
    schedulable: 'http://soustack.org/schema/v0.3.0/profiles/schedulable',
  };

  const schemaId = schemaIds[profileName];
  if (!schemaId) {
    throw new Error(`Unknown fixture profile directory: ${profileName}`);
  }

  return schemaId;
}

function applySchema(recipe: any, schemaId: string): any {
  return {
    ...recipe,
    $schema: schemaId,
  };
}

function formatErrors(
  fixturePath: string,
  errors: Array<{ path: string; message: string; keyword?: string }>,
  maxErrors: number = 3,
): string {
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
        const fixture = applySchema(JSON.parse(fixtureContent), schemaIdForFixture(fixturePath));
        const result = validateRecipe(fixture);

        if (!result.valid) {
          throw new Error(`Expected fixture to be valid but validation failed:${formatErrors(fixturePath, result.errors)}`);
        }

        expect(result.valid).toBe(true);
      },
    );
  });

  describe('invalid fixtures', () => {
    it.each(invalidFixtures.map((fixturePath) => [path.relative(process.cwd(), fixturePath), fixturePath]))(
      'should reject %s',
      (_relativePath, fixturePath) => {
        const fixtureContent = fs.readFileSync(fixturePath, 'utf8');
        const fixture = applySchema(JSON.parse(fixtureContent), schemaIdForFixture(fixturePath));
        const result = validateRecipe(fixture);

        if (result.valid) {
          const relativePath = path.relative(process.cwd(), fixturePath);
          throw new Error(
            `Expected fixture to be invalid but validation passed:${formatErrors(fixturePath, result.errors)}`,
          );
        }

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      },
    );
  });
});
