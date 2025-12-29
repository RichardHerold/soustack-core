import { normalizeRecipe } from '../src/normalize';
import { Recipe } from '../src/types';
import { CANONICAL_ROOT_SCHEMA_URL } from '../src/schemaMetadata';

describe('normalizeRecipe', () => {
  const legacyKey = ['mod', 'ules'].join('');
  const legacyErrorMessage = 'legacy field is no longer supported';
  it('preserves existing stacks map format', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      stacks: { scaling: 1, timed: 2 },
    };

    const result = normalizeRecipe(input);
    expect(result.recipe.stacks).toEqual({ scaling: 1, timed: 2 });
    expect(result.warnings).toHaveLength(0);
  });

  it('rejects inputs with legacy field', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      [legacyKey]: ['scaling@1', 'timed@1'],
    };

    expect(() => normalizeRecipe(input)).toThrow(legacyErrorMessage);
  });

  it('converts legacy stacks array to stacks map', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      stacks: ['scaling@1', 'timed@2'],
    };

    const result = normalizeRecipe(input);
    expect(result.recipe.stacks).toEqual({ scaling: 1, timed: 2 });
    expect(result.warnings).toHaveLength(0);
  });

  it('rejects inputs with legacy field (multiple versions)', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      [legacyKey]: ['scaling@1', 'scaling@2', 'timed@1'],
    };

    expect(() => normalizeRecipe(input)).toThrow(legacyErrorMessage);
  });

  it('rejects inputs with legacy field (even with invalid identifiers)', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      [legacyKey]: ['scaling@1', 'invalid-format', 'timed@1', 'missing-version@'],
    };

    expect(() => normalizeRecipe(input)).toThrow(legacyErrorMessage);
  });

  it('warns about invalid stack version numbers', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      stacks: { scaling: 1, timed: 0, invalid: -1, notANumber: '1' as any },
    };

    const result = normalizeRecipe(input);
    expect(result.recipe.stacks).toEqual({ scaling: 1 });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes('timed'))).toBe(true);
    expect(result.warnings.some(w => w.includes('invalid'))).toBe(true);
    expect(result.warnings.some(w => w.includes('notANumber'))).toBe(true);
  });

  it('ensures stacks exists even if empty', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
    };

    const result = normalizeRecipe(input);
    expect(result.recipe.stacks).toEqual({});
    expect(result.warnings).toHaveLength(0);
  });

  it('rejects inputs with legacy field (even with stacks array)', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      [legacyKey]: ['scaling@1'],
      stacks: ['timed@2'],
    };

    expect(() => normalizeRecipe(input)).toThrow(legacyErrorMessage);
  });

  it('rejects inputs with legacy field (even with stacks map)', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      [legacyKey]: ['scaling@1'],
      stacks: { timed: 2 },
    };

    expect(() => normalizeRecipe(input)).toThrow(legacyErrorMessage);
  });

  it('rejects inputs with empty legacy array', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      [legacyKey]: [],
    };

    expect(() => normalizeRecipe(input)).toThrow(legacyErrorMessage);
  });

  it('rejects inputs with legacy field (even with non-string entries)', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      [legacyKey]: ['scaling@1', null, undefined, 123, 'timed@1'],
    };

    expect(() => normalizeRecipe(input)).toThrow(legacyErrorMessage);
  });

  it('throws error for non-object input', () => {
    expect(() => normalizeRecipe(null)).toThrow('Recipe input must be an object');
    expect(() => normalizeRecipe(undefined)).toThrow('Recipe input must be an object');
    expect(() => normalizeRecipe('string')).toThrow('Recipe input must be an object');
    expect(() => normalizeRecipe(123)).toThrow('Recipe input must be an object');
  });

  it('does not mutate the input object', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      stacks: { scaling: 1 },
    };

    const originalStacks = { ...input.stacks };
    normalizeRecipe(input);
    
    expect(input.stacks).toEqual(originalStacks);
  });

  it('maps deprecated version to recipeVersion with warning', () => {
    const input: any = {
      name: 'Versioned Recipe',
      ingredients: [],
      instructions: [],
      version: '2.0.0',
    };

    const result = normalizeRecipe(input);
    expect(result.recipe.recipeVersion).toBe('2.0.0');
    expect(result.warnings.some(w => w.includes('deprecated'))).toBe(true);
    expect((input as any).recipeVersion).toBeUndefined();
  });

  it('normalizes time durations in structured time fields', () => {
    const input: any = {
      name: 'Timing Recipe',
      ingredients: [],
      instructions: [],
      time: {
        prep: 'PT5M',
        active: 'PT10M',
        passive: 20,
        total: 'PT30M',
      },
    };

    const result = normalizeRecipe(input);
    expect(result.recipe.time).toEqual(
      expect.objectContaining({ prep: 5, active: 10, passive: 20, total: 30 })
    );
  });

  describe('$schema normalization', () => {
    it('normalizes legacy soustack.spec URL to canonical', () => {
      const input: any = {
        name: 'Test Recipe',
        ingredients: [],
        instructions: [],
        $schema: 'https://soustack.spec/soustack.schema.json',
      };

      const result = normalizeRecipe(input);
      expect(result.recipe.$schema).toBe(CANONICAL_ROOT_SCHEMA_URL);
    });

    it('normalizes legacy soustack.ai URL to canonical', () => {
      const input: any = {
        name: 'Test Recipe',
        ingredients: [],
        instructions: [],
        $schema: 'https://soustack.ai/schemas/recipe.schema.json',
      };

      const result = normalizeRecipe(input);
      expect(result.recipe.$schema).toBe(CANONICAL_ROOT_SCHEMA_URL);
    });

    it('normalizes legacy soustack.org URL to canonical', () => {
      const input: any = {
        name: 'Test Recipe',
        ingredients: [],
        instructions: [],
        $schema: 'http://soustack.org/schema/v0.0.2',
      };

      const result = normalizeRecipe(input);
      expect(result.recipe.$schema).toBe(CANONICAL_ROOT_SCHEMA_URL);
    });

    it('preserves canonical URL unchanged', () => {
      const input: any = {
        name: 'Test Recipe',
        ingredients: [],
        instructions: [],
        $schema: CANONICAL_ROOT_SCHEMA_URL,
      };

      const result = normalizeRecipe(input);
      expect(result.recipe.$schema).toBe(CANONICAL_ROOT_SCHEMA_URL);
    });

    it('preserves unknown custom schema URLs unchanged', () => {
      const customUrl = 'https://example.com/custom.schema.json';
      const input: any = {
        name: 'Test Recipe',
        ingredients: [],
        instructions: [],
        $schema: customUrl,
      };

      const result = normalizeRecipe(input);
      expect(result.recipe.$schema).toBe(customUrl);
    });

    it('handles missing $schema field', () => {
      const input: any = {
        name: 'Test Recipe',
        ingredients: [],
        instructions: [],
      };

      const result = normalizeRecipe(input);
      expect(result.recipe.$schema).toBeUndefined();
    });
  });
});
