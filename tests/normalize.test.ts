import { normalizeRecipe } from '../src/normalize';
import { Recipe } from '../src/types';

describe('normalizeRecipe', () => {
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

  it('rejects inputs with modules field', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      modules: ['scaling@1', 'timed@1'],
    };

    expect(() => normalizeRecipe(input)).toThrow('The `modules` field is no longer supported');
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

  it('rejects inputs with modules field (multiple versions)', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      modules: ['scaling@1', 'scaling@2', 'timed@1'],
    };

    expect(() => normalizeRecipe(input)).toThrow('The `modules` field is no longer supported');
  });

  it('rejects inputs with modules field (even with invalid identifiers)', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      modules: ['scaling@1', 'invalid-format', 'timed@1', 'missing-version@'],
    };

    expect(() => normalizeRecipe(input)).toThrow('The `modules` field is no longer supported');
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

  it('rejects inputs with modules field (even with stacks array)', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      modules: ['scaling@1'],
      stacks: ['timed@2'],
    };

    expect(() => normalizeRecipe(input)).toThrow('The `modules` field is no longer supported');
  });

  it('rejects inputs with modules field (even with stacks map)', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      modules: ['scaling@1'],
      stacks: { timed: 2 },
    };

    expect(() => normalizeRecipe(input)).toThrow('The `modules` field is no longer supported');
  });

  it('rejects inputs with empty modules array', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      modules: [],
    };

    expect(() => normalizeRecipe(input)).toThrow('The `modules` field is no longer supported');
  });

  it('rejects inputs with modules field (even with non-string entries)', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      modules: ['scaling@1', null, undefined, 123, 'timed@1'],
    };

    expect(() => normalizeRecipe(input)).toThrow('The `modules` field is no longer supported');
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
});

