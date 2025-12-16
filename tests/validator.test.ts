import { detectProfiles, validateRecipe, ValidationResult } from '../src/validator';
import { Recipe } from '../src/types';
import path from 'path';
import fs from 'fs';

type ProfileName = 'base' | 'cookable' | 'scalable' | 'quantified' | 'illustrated' | 'schedulable';

function loadFixture(profile: ProfileName, type: 'valid' | 'invalid', file: string): Recipe {
  const fixturePath = path.join(__dirname, '..', 'spec', 'fixtures', profile, type, file);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

describe('Soustack validation', () => {
  const baseValid = loadFixture('base', 'valid', 'simple.json');

  it('validates the base schema with metadata and extensions', () => {
    const recipe: Recipe = { ...baseValid, metadata: { notes: 'extra' }, 'x-extra': true };
    const result = validateRecipe(recipe);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.normalized).toBeDefined();
  });

  it('detects unknown top-level keys as errors', () => {
    const recipe = { ...baseValid, unexpected: true };
    const result = validateRecipe(recipe);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatchObject({ path: '/unexpected', keyword: 'additionalProperties' });
  });

  it('auto-detects profile validation from $schema', () => {
    const cookable: Recipe = {
      ...baseValid,
      $schema: 'https://raw.githubusercontent.com/RichardHerold/soustack-spec/v0.2.1/profiles/cookable.schema.json',
    };

    const result = validateRecipe(cookable);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts an explicit profile selection', () => {
    const result = validateRecipe(baseValid, { profile: 'base' });
    expect(result.valid).toBe(true);
  });

  it('normalizes deprecated version into recipeVersion without mutating the input', () => {
    const recipe: Recipe = { ...baseValid, version: '2.0.0' };
    const result = validateRecipe(recipe);
    expect(result.valid).toBe(true);
    expect(result.normalized?.recipeVersion).toBe('2.0.0');
    expect(recipe.recipeVersion).toBeUndefined();
    expect(result.warnings[0].message).toContain('deprecated');
  });

  it('collects detailed errors for invalid fixtures', () => {
    const invalid = loadFixture('base', 'invalid', 'missing-fields.json');
    const result: ValidationResult = validateRecipe(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toEqual(
      expect.objectContaining({ path: expect.any(String), message: expect.any(String), keyword: expect.any(String) }),
    );
  });

  describe('profile fixtures', () => {
    const profiles: ProfileName[] = ['cookable', 'quantified', 'illustrated', 'schedulable'];

    it.each(profiles)('validates %s fixtures', (profile) => {
      const valid = loadFixture(profile, 'valid', fs.readdirSync(path.join(__dirname, '..', 'spec', 'fixtures', profile, 'valid'))[0]);
      const result = validateRecipe(valid, { profile });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it.each(profiles)('reports errors for invalid %s fixtures', (profile) => {
      const invalidDir = path.join(__dirname, '..', 'spec', 'fixtures', profile, 'invalid');
      const invalidFile = fs.readdirSync(invalidDir)[0];
      const invalid = loadFixture(profile, 'invalid', invalidFile);
      const result = validateRecipe(invalid, { profile });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toEqual(
        expect.objectContaining({ path: expect.any(String), message: expect.any(String), keyword: expect.any(String) }),
      );
    });
  });

  it('detects all profiles that validate a recipe', () => {
    const profiles = detectProfiles(baseValid);
    expect(profiles).toContain('base');
    expect(profiles.length).toBeGreaterThanOrEqual(1);
  });
});
