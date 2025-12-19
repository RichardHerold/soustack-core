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

  it('converts legacy modules array to stacks map', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      modules: ['scaling@1', 'timed@1'],
    };

    const result = normalizeRecipe(input);
    expect(result.recipe.stacks).toEqual({ scaling: 1, timed: 1 });
    expect(result.warnings).toHaveLength(0);
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

  it('handles modules array with multiple versions of same module (keeps highest)', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      modules: ['scaling@1', 'scaling@2', 'timed@1'],
    };

    const result = normalizeRecipe(input);
    expect(result.recipe.stacks).toEqual({ scaling: 2, timed: 1 });
    expect(result.warnings).toHaveLength(0);
  });

  it('warns about invalid module identifiers and ignores them', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      modules: ['scaling@1', 'invalid-format', 'timed@1', 'missing-version@'],
    };

    const result = normalizeRecipe(input);
    expect(result.recipe.stacks).toEqual({ scaling: 1, timed: 1 });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes('invalid-format'))).toBe(true);
    expect(result.warnings.some(w => w.includes('missing-version@'))).toBe(true);
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

  it('handles mixed legacy formats (modules and stacks array)', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      modules: ['scaling@1'],
      stacks: ['timed@2'],
    };

    const result = normalizeRecipe(input);
    expect(result.recipe.stacks).toEqual({ scaling: 1, timed: 2 });
    expect(result.warnings).toHaveLength(0);
  });

  it('preserves stacks map when both modules array and stacks map exist', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      modules: ['scaling@1'],
      stacks: { timed: 2 },
    };

    const result = normalizeRecipe(input);
    // Stacks map takes precedence, but modules are also merged in
    expect(result.recipe.stacks).toEqual({ scaling: 1, timed: 2 });
    expect(result.warnings).toHaveLength(0);
  });

  it('handles empty modules array', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      modules: [],
    };

    const result = normalizeRecipe(input);
    expect(result.recipe.stacks).toEqual({});
    expect(result.warnings).toHaveLength(0);
  });

  it('handles non-string entries in modules array', () => {
    const input: any = {
      name: 'Test Recipe',
      ingredients: [],
      instructions: [],
      modules: ['scaling@1', null, undefined, 123, 'timed@1'],
    };

    const result = normalizeRecipe(input);
    expect(result.recipe.stacks).toEqual({ scaling: 1, timed: 1 });
    expect(result.warnings).toHaveLength(0);
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
      modules: ['scaling@1'],
    };

    const originalModules = [...input.modules];
    normalizeRecipe(input);
    
    expect(input.modules).toEqual(originalModules);
    expect(input.stacks).toBeUndefined();
  });
});

