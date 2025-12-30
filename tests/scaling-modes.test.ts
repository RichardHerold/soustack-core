import { scaleRecipe } from '../src/parser';
import { Ingredient, Recipe } from '../src/types';

// Inline fixture with various scaling modes
const scalingModesFixture: Recipe = {
  profile: 'scalable',
  stacks: { quantified: 1, scaling: 1 },
  name: 'Scaling Modes Test Recipe',
  yield: { amount: 1, unit: 'batch' },
  time: { total: { minutes: 60 } },
  ingredients: [
    {
      id: 'flour',
      name: 'Flour',
      quantity: { amount: 500, unit: 'g' },
      scaling: { mode: 'linear' }
    },
    {
      id: 'eggs',
      name: 'Eggs',
      quantity: { amount: 3, unit: null },
      scaling: { mode: 'discrete', step: 1, rounding: 'nearest', min: 1, max: 12 }
    },
    {
      id: 'salt',
      name: 'Salt',
      quantity: { amount: 10, unit: 'g' },
      scaling: { mode: 'fixed' }
    },
    {
      id: 'chocolate-chips',
      name: 'Chocolate Chips',
      quantity: { amount: 150, unit: 'g' },
      scaling: { mode: 'proportional', factor: 0.5 }
    },
    {
      id: 'starter',
      name: 'Sourdough Starter',
      quantity: { amount: 100, unit: 'g' },
      scaling: { mode: 'bakersPercent', percent: 20, of: 'flour' }
    }
  ],
  instructions: [
    { id: 'mix', text: 'Mix ingredients.' },
    { id: 'knead', text: 'Knead dough.' },
    { id: 'rest', text: 'Rest dough.' }
  ]
};

describe('scaleRecipe', () => {
  test('scales each ingredient mode deterministically', () => {
    const scaled = scaleRecipe(scalingModesFixture, { multiplier: 3 });

    // flour: 500 * 3 = 1500 (linear)
    expect(findIngredient(scaled.ingredients, 'flour')?.quantity?.amount).toBe(1500);
    // Eggs: 3 * 3 = 9 (discrete, step: 1)
    expect(findIngredient(scaled.ingredients, 'eggs')?.quantity?.amount).toBe(9);
    // Salt: 10 (fixed, no scaling)
    expect(findIngredient(scaled.ingredients, 'salt')?.quantity?.amount).toBe(10);
    // Chocolate Chips: 150 * 3 * 0.5 = 225 (proportional with factor 0.5)
    expect(findIngredient(scaled.ingredients, 'chocolate-chips')?.quantity?.amount).toBe(225);
    // starter: bakers % of flour (1500 * 0.2 = 300)
    expect(findIngredient(scaled.ingredients, 'starter')?.quantity?.amount).toBe(300);
  });

  test('uses target yield to derive multiplier', () => {
    const scaled = scaleRecipe(scalingModesFixture, { targetYield: { amount: 2 } });

    expect(scaled.yield?.amount).toBe(2);
    // flour: 500 * 2 = 1000 (linear)
    expect(findIngredient(scaled.ingredients, 'flour')?.quantity?.amount).toBe(1000);
  });

  test('preserves instructions across scaling', () => {
    const scaled = scaleRecipe(scalingModesFixture, { multiplier: 3 });

    // Instructions should be preserved
    expect(scaled.instructions).toHaveLength(3);
    const lastInstruction = scaled.instructions[2];
    if (typeof lastInstruction === 'string') {
      expect(lastInstruction).toBe('Rest dough.');
    } else if ('text' in lastInstruction) {
      expect(lastInstruction.text).toBe('Rest dough.');
    }
  });

  test("throws when baker's percentage ingredient lacks an 'of' reference", () => {
    const recipe: Recipe = {
      profile: 'lite',
      name: 'Bad Bakers',
      yield: { amount: 1, unit: 'loaf' },
      time: { total: { minutes: 60 } },
      stacks: {},
      ingredients: [
        {
          id: 'salt',
          name: 'Salt',
          quantity: { amount: 2, unit: 'g' },
          scaling: { mode: 'bakersPercent', percent: 2 } as any // Missing 'of' field
        }
      ],
      instructions: []
    };

    expect(() => scaleRecipe(recipe, { multiplier: 2 })).toThrow(/of|reference/);
  });
});

function findIngredient(items: Recipe['ingredients'], idOrName: string): Ingredient | undefined {
  for (const item of items) {
    if (typeof item === 'string') continue;
    if ('section' in item) {
      const match: Ingredient | undefined = findIngredient(item.ingredients as any, idOrName);
      if (match) return match;
    } else if (item.id === idOrName || item.name === idOrName) {
      return item;
    }
  }

  return undefined;
}

function findInstruction(items: Recipe['instructions'], id: string): any {
  for (const item of items) {
    if (typeof item === 'string') continue;
    if ('section' in item) {
      const match = findInstruction(item.steps as any, id);
      if (match) return match;
    } else if (item.id === id) {
      return item;
    }
  }

  return undefined;
}
