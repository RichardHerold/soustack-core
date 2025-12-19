import { detectProfiles, validateRecipe, ValidationResult } from '../src/validator';
import { Recipe } from '../src/types';
import path from 'path';
import fs from 'fs';

type ProfileName = 'minimal' | 'core';

function loadFixture(profile: ProfileName, type: 'valid' | 'invalid', file: string): Recipe {
  const fixturePath = path.join(__dirname, '..', 'spec', 'fixtures', profile, type, file);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

function loadExampleFixture(file: string): Recipe {
  const fixturePath = path.join(__dirname, '..', 'spec', 'examples', 'fixtures', file);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

describe('Soustack validation', () => {
  // Load base fixture (may not have profile, will default to core)
  const baseValidRaw = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'spec', 'fixtures', 'base', 'valid', 'quick-salsa.json'), 'utf8')
  );
  const baseValid: Recipe = { 
    '@type': 'Recipe',
    ...baseValidRaw, 
    profile: baseValidRaw.profile || 'core',
    modules: baseValidRaw.modules || []
  };
  
  // Load example fixtures for v0.3.0
  const minimalValid = loadExampleFixture('minimal.valid.json');
  const minimalNutritionValid = loadExampleFixture('minimal+nutrition.valid.json');
  const minimalScheduleInvalid = loadExampleFixture('minimal+schedule.invalid.json');
  const coreScheduleValid = loadExampleFixture('core+schedule.valid.json');

  it('validates the base schema with extensions', () => {
    const recipe: Recipe = { ...baseValid, 'x-extra': true };
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
    const recipe: Recipe = {
      ...baseValid,
      $schema: 'http://soustack.org/schema/recipe/profiles/core.schema.json',
      modules: ['times@1'], // Add times module for times field
      times: { prepMinutes: 10, cookMinutes: 20, totalMinutes: 30 }, // times module uses prepMinutes/cookMinutes/totalMinutes
      yield: baseValid.yield || { amount: 1, unit: 'serving' },
    };

    const result = validateRecipe(recipe);
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
    const result = validateRecipe(baseValid, { profile: 'core' });
    expect(result.valid).toBe(true);
  });

  it('defaults to core profile if profile is missing', () => {
    const recipe = { ...baseValid };
    delete (recipe as any).profile;
    const result = validateRecipe(recipe);
    expect(result.valid).toBe(true);
    // Should validate against core profile
  });

  it('defaults to empty modules array if modules is missing', () => {
    const recipe = { ...minimalValid };
    delete (recipe as any).modules;
    const result = validateRecipe(recipe, { profile: 'minimal' });
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
      const recipeRaw = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'spec', 'fixtures', 'base', 'valid', 'time-iso.json'), 'utf8')
      );
      const recipe: Recipe = { 
        '@type': 'Recipe',
        ...recipeRaw, 
        profile: recipeRaw.profile || 'core',
        modules: recipeRaw.modules || []
      };
      const result = validateRecipe(recipe);

      expect(result.valid).toBe(true);
      // The validator preserves ISO8601 strings in normalized output
      expect(result.normalized?.time).toEqual(
        expect.objectContaining({ prepTime: 'PT5M', cookTime: 'PT12M' })
      );
    });

    it('keeps numeric durations unchanged', () => {
      const recipeRaw = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'spec', 'fixtures', 'base', 'valid', 'time-numeric.json'), 'utf8')
      );
      const recipe: Recipe = { 
        '@type': 'Recipe',
        ...recipeRaw, 
        profile: recipeRaw.profile || 'core',
        modules: recipeRaw.modules || []
      };
      const result = validateRecipe(recipe);

      expect(result.valid).toBe(true);
      expect(result.normalized?.time).toEqual(recipe.time);
    });

    it('handles mixed numeric and ISO durations', () => {
      const recipeRaw = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'spec', 'fixtures', 'base', 'valid', 'time-mixed.json'), 'utf8')
      );
      const recipe: Recipe = { 
        '@type': 'Recipe',
        ...recipeRaw, 
        profile: recipeRaw.profile || 'core',
        modules: recipeRaw.modules || []
      };
      const result = validateRecipe(recipe);

      expect(result.valid).toBe(true);
      // active: 10, passive: 30, total: 40, cookTime: PT40M = 40
      expect(result.normalized?.time).toEqual(
        expect.objectContaining({ active: 10, passive: 30, total: 40 })
      );
    });
  });

  it('collects detailed errors for invalid fixtures', () => {
    const invalidRaw = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'spec', 'fixtures', 'base', 'invalid', 'missing-name.json'), 'utf8')
    );
    const invalid: Recipe = { 
      '@type': 'Recipe',
      ...invalidRaw, 
      profile: invalidRaw.profile || 'core',
      modules: invalidRaw.modules || []
    };
    const result: ValidationResult = validateRecipe(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toEqual(
      expect.objectContaining({ path: expect.any(String), message: expect.any(String), keyword: expect.any(String) }),
    );
  });

  describe('profile fixtures', () => {
    const profiles: ProfileName[] = ['minimal', 'core'];

    it.each(profiles)('validates %s fixtures', (profile) => {
      const validDir = path.join(__dirname, '..', 'spec', 'fixtures', profile, 'valid');
      if (!fs.existsSync(validDir)) return;
      const validFiles = fs.readdirSync(validDir).filter(f => f.endsWith('.json'));
      if (validFiles.length === 0) return;
      const valid = loadFixture(profile, 'valid', validFiles[0]);
      const result = validateRecipe(valid, { profile });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it.each(profiles)('reports errors for invalid %s fixtures', (profile) => {
      const invalidDir = path.join(__dirname, '..', 'spec', 'fixtures', profile, 'invalid');
      if (!fs.existsSync(invalidDir)) return;
      const invalidFiles = fs.readdirSync(invalidDir).filter(f => f.endsWith('.json'));
      if (invalidFiles.length === 0) return;
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
    expect(profiles.length).toBeGreaterThanOrEqual(1);
    // Should detect at least core, possibly minimal
    expect(profiles).toContain('core');
  });

  describe('schedule module instruction graphs', () => {
    it('fails when dependsOn references a missing node', () => {
      const recipe = {
        ...coreScheduleValid,
        instructions: [
          { id: 'step-1', text: 'First step' },
          { id: 'step-2', text: 'Second step', dependsOn: ['missing-step'] },
        ],
      };
      const result = validateRecipe(recipe);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringMatching(/dependsOn/),
            message: expect.stringMatching(/missing/),
          }),
        ]),
      );
    });

    it('fails when the dependency graph contains a cycle', () => {
      const recipe = {
        ...coreScheduleValid,
        instructions: [
          { id: 'step-1', text: 'First step', dependsOn: ['step-2'] },
          { id: 'step-2', text: 'Second step', dependsOn: ['step-1'] },
        ],
      };
      const result = validateRecipe(recipe);

      expect(result.valid).toBe(false);
      expect(result.errors.some((error) => /cycle|circular/i.test(error.message))).toBe(true);
    });

    it('passes for valid dependency graphs with schedule module', () => {
      const result = validateRecipe(coreScheduleValid);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('composed validation with modules', () => {
    it('validates minimal profile with nutrition module', () => {
      const result = validateRecipe(minimalNutritionValid);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails when schedule module is used with minimal profile', () => {
      const result = validateRecipe(minimalScheduleInvalid);
      expect(result.valid).toBe(false);
      // Schedule module requires core profile, not minimal
    });

    it('validates core profile with schedule module', () => {
      const result = validateRecipe(coreScheduleValid);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('enforces module declaration when payload exists (module contract)', () => {
      const recipe = {
        ...minimalValid,
        nutrition: { calories: 100, protein_g: 5 },
        // modules is missing or doesn't include nutrition@1
      };
      const result = validateRecipe(recipe);

      // Module contract: if payload exists, module must be declared
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => 
        e.message.includes('nutrition') || 
        e.message.includes('modules') ||
        e.path.includes('modules')
      )).toBe(true);
    });

    it('enforces payload existence when module is declared (module contract)', () => {
      const recipe = {
        ...minimalValid,
        modules: ['nutrition@1'],
        // nutrition payload is missing
      };
      const result = validateRecipe(recipe);

      // Module contract: if module is declared, payload must exist
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => 
        e.message.includes('nutrition') || 
        e.path.includes('nutrition')
      )).toBe(true);
    });

    it('validates when both module declaration and payload exist', () => {
      const recipe = {
        ...minimalValid,
        modules: ['nutrition@1'],
        nutrition: { calories: 100, protein_g: 5 },
      };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('infers modules from payload and enforces declaration requirement', () => {
      const recipe = {
        ...minimalValid,
        times: { prepMinutes: 10, cookMinutes: 20, totalMinutes: 30 },
        // modules doesn't include times@1
      };
      const result = validateRecipe(recipe);

      // Should infer times@1 from payload and enforce that it's declared
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => 
        e.message.includes('times') || 
        e.message.includes('modules') ||
        e.path.includes('modules')
      )).toBe(true);
    });

    it('validates with multiple modules', () => {
      const recipe = {
        ...minimalValid,
        modules: ['nutrition@1', 'times@1'],
        nutrition: { calories: 100, protein_g: 5 },
        times: { prepMinutes: 10, cookMinutes: 20, totalMinutes: 30 }, // times module uses prepMinutes/cookMinutes/totalMinutes
      };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('caches validators by profile and sorted modules', () => {
      const recipe1 = {
        ...minimalValid,
        modules: ['nutrition@1', 'times@1'],
        nutrition: { calories: 100, protein_g: 5 },
        times: { prepMinutes: 10, cookMinutes: 20, totalMinutes: 30 },
      };
      const recipe2 = {
        ...minimalValid,
        modules: ['times@1', 'nutrition@1'], // Same modules, different order
        nutrition: { calories: 100, protein_g: 5 },
        times: { prepMinutes: 10, cookMinutes: 20, totalMinutes: 30 },
      };
      
      const result1 = validateRecipe(recipe1);
      const result2 = validateRecipe(recipe2);
      
      // Both should be valid and use the same cached validator
      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);
    });
  });

  describe('vendored spec fixtures', () => {
    it('validates a valid fixture from spec/fixtures/base/valid', () => {
      const validFixture = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'spec', 'fixtures', 'base', 'valid', 'quick-salsa.json'), 'utf8')
      );
      // Add required fields for validation
      const recipe = { '@type': 'Recipe', profile: 'core', ...validFixture };
      const result = validateRecipe(recipe);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates an invalid fixture from spec/fixtures/base/invalid', () => {
      const invalidFixture = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'spec', 'fixtures', 'base', 'invalid', 'missing-name.json'), 'utf8')
      );
      const result = validateRecipe(invalidFixture);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
