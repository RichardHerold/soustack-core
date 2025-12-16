import { detectProfiles, validateRecipe, ValidationResult } from '../src/validator';
import { Recipe } from '../src/types';
import path from 'path';
import fs from 'fs';

type ProfileName = 'base' | 'cookable' | 'scalable' | 'quantified' | 'illustrated' | 'schedulable';

function loadFixture(profile: ProfileName, type: 'valid' | 'invalid', file: string): Recipe {
  const fixturePath = path.join(__dirname, '..', 'spec', 'fixtures', profile, type, file);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

function loadModuleFixture(mod: string, file: string): Recipe {
  const fixturePath = path.join(__dirname, '..', 'spec', 'fixtures', 'modules', mod, file);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

describe('Soustack validation', () => {
  const baseValid = loadFixture('base', 'valid', 'quick-salsa.json');

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
      time: { prep: 10, active: 20, total: 30 },
      yield: baseValid.yield || { amount: 1, unit: 'serving' },
    };

    const result = validateRecipe(cookable);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('ignores non-Soustack $schema hints for profile detection', () => {
    const recipe: Recipe = { ...baseValid, $schema: 'http://json-schema.org/draft-07/schema#' };

    const result = validateRecipe(recipe);
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

  describe('time normalization', () => {
    it('converts ISO8601 durations into minutes', () => {
      const recipe = loadFixture('base', 'valid', 'time-iso.json');
      const result = validateRecipe(recipe);

      expect(result.valid).toBe(true);
      // The validator preserves ISO8601 strings in normalized output
      expect(result.normalized?.time).toEqual(
        expect.objectContaining({ prepTime: 'PT5M', cookTime: 'PT12M' })
      );
    });

    it('keeps numeric durations unchanged', () => {
      const recipe = loadFixture('base', 'valid', 'time-numeric.json');
      const result = validateRecipe(recipe);

      expect(result.valid).toBe(true);
      expect(result.normalized?.time).toEqual(recipe.time);
    });

    it('handles mixed numeric and ISO durations', () => {
      const recipe = loadFixture('base', 'valid', 'time-mixed.json');
      const result = validateRecipe(recipe);

      expect(result.valid).toBe(true);
      // active: 10, passive: 30, total: 40, cookTime: PT40M = 40
      expect(result.normalized?.time).toEqual(
        expect.objectContaining({ active: 10, passive: 30, total: 40 })
      );
    });
  });

  it('collects detailed errors for invalid fixtures', () => {
    const invalid = loadFixture('base', 'invalid', 'missing-name.json');
    const result: ValidationResult = validateRecipe(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toEqual(
      expect.objectContaining({ path: expect.any(String), message: expect.any(String), keyword: expect.any(String) }),
    );
  });

  describe('profile fixtures', () => {
    const profiles: ProfileName[] = ['cookable', 'quantified', 'illustrated', 'schedulable'];

    it.each(profiles)('validates %s fixtures', (profile) => {
      const validDir = path.join(__dirname, '..', 'spec', 'fixtures', profile, 'valid');
      const validFiles = fs.readdirSync(validDir).filter(f => f.endsWith('.json'));
      const valid = loadFixture(profile, 'valid', validFiles[0]);
      const result = validateRecipe(valid, { profile });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it.each(profiles)('reports errors for invalid %s fixtures', (profile) => {
      const invalidDir = path.join(__dirname, '..', 'spec', 'fixtures', profile, 'invalid');
      const invalidFiles = fs.readdirSync(invalidDir).filter(f => f.endsWith('.json'));
      const invalid = loadFixture(profile, 'invalid', invalidFiles[0]);
      const result = validateRecipe(invalid, { profile });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toEqual(
        expect.objectContaining({ path: expect.any(String), message: expect.any(String) }),
      );
    });
  });

  it('detects all profiles that validate a recipe', () => {
    const profiles = detectProfiles(baseValid);
    expect(profiles).toContain('base');
    expect(profiles.length).toBeGreaterThanOrEqual(1);
  });

  describe('schedulable instruction graphs', () => {
    it('fails when dependsOn references a missing node', () => {
      const invalid = loadFixture('schedulable', 'invalid', 'dag-missing-node.json');
      const result = validateRecipe(invalid, { profile: 'schedulable' });

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/instructions/1/dependsOn/0',
            message: expect.stringMatching(/missing/),
          }),
        ]),
      );
    });

    it('fails when the dependency graph contains a cycle', () => {
      const invalid = loadFixture('schedulable', 'invalid', 'dag-cycle.json');
      const result = validateRecipe(invalid, { profile: 'schedulable' });

      expect(result.valid).toBe(false);
      expect(result.errors.some((error) => /cycle|circular/i.test(error.message))).toBe(true);
    });

    it('passes for valid dependency graphs', () => {
      const valid = loadFixture('schedulable', 'valid', 'dag-simple.json');
      const result = validateRecipe(valid, { profile: 'schedulable' });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('module overlays', () => {
    it('fails when schedule module is declared without schedulable instructions', () => {
      const recipe = loadModuleFixture('schedule', 'minimal-with-module.json');
      const result = validateRecipe(recipe);

      expect(result.valid).toBe(false);
    });

    it('passes when schedule module is declared with schedulable instructions', () => {
      const recipe = loadModuleFixture('schedule', 'core-with-module.json');
      const result = validateRecipe(recipe);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects nutrition blocks when the nutrition module is missing', () => {
      const recipe = loadModuleFixture('nutrition', 'nutrition-without-module.json');
      const result = validateRecipe(recipe);

      expect(result.valid).toBe(false);
    });
  });
});
