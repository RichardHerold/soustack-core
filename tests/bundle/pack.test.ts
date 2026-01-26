import { isSoustackRecipeLike, packSoustackRecipes } from '../../src/bundle/pack';

describe('bundle/pack', () => {
  it('filters to recipe-like objects and preserves meta', () => {
    const packedAt = '2024-01-01T00:00:00.000Z';
    const valid = {
      name: 'Test Recipe',
      profile: 'base',
      stacks: {},
      ingredients: [],
      instructions: [],
      'x-extra': { keep: true },
    };
    const invalid = { name: 'No profile' };
    const valid2 = {
      name: 'Another',
      profile: 'lite',
      stacks: { timed: {} },
      ingredients: ['flour'],
      instructions: ['mix'],
    };

    const result = packSoustackRecipes({
      recipes: [valid, invalid, valid2],
      packedAt,
      source: 'fixtures',
    });

    expect(result.recipes).toEqual([valid, valid2]);
    expect(result.meta).toEqual({
      packedAt,
      count: 2,
      source: 'fixtures',
    });
  });

  it('detects recipe-like shape with minimal fields', () => {
    const candidate = {
      name: 'Minimal',
      profile: 'base',
      stacks: {},
      ingredients: [],
      instructions: [],
    };
    expect(isSoustackRecipeLike(candidate)).toBe(true);
    expect(isSoustackRecipeLike(null)).toBe(false);
    expect(isSoustackRecipeLike({})).toBe(false);
  });
});
