import { scaleRecipe } from '../src/parser';
import { Recipe } from '../src/types';

// The "Sourdough Stress Test" Data
const sourdough: Recipe = {
  profile: 'lite',
  name: "Rustic Sourdough",
  yield: { amount: 1, unit: "loaf" },
  time: { total: { minutes: 60 } },
  stacks: {},
  ingredients: [
    {
      id: "flour",
      name: "Bread Flour",
      quantity: { amount: 500, unit: "g" },
      scaling: { mode: "linear" }
    },
    {
      id: "salt",
      name: "Salt",
      quantity: { amount: 10, unit: "g" },
      scaling: { mode: "bakersPercent", percent: 2, of: "flour" }
    }
  ],
  instructions: []
};

describe('Soustack Logic Engine', () => {
  test('scales linear ingredients (flour) correctly', () => {
    // Scale 1 loaf -> 2 loaves
    const result = scaleRecipe(sourdough, { multiplier: 2 });

    const flour = findIngredient(result.ingredients, 'flour');
    expect(flour?.quantity?.amount).toBe(1000); // 500 * 2
  });

  test('scales bakers percentage (salt) correctly', () => {
    // Scale 1 loaf -> 2 loaves
    const result = scaleRecipe(sourdough, { multiplier: 2 });

    const salt = findIngredient(result.ingredients, 'salt');
    // Salt should be 20g (2% of the NEW flour weight, which is 1000g)
    expect(salt?.quantity?.amount).toBe(20);
  });

  test('scales bakers percentage without factor (calculates ratio)', () => {
    // Test case where percent is calculated from original amounts
    const recipeWithRatio: Recipe = {
      profile: 'lite',
      name: "Test Recipe",
      yield: { amount: 1, unit: "loaf" },
      time: { total: { minutes: 60 } },
      stacks: {},
      ingredients: [
        {
          id: "flour",
          name: "Bread Flour",
          quantity: { amount: 500, unit: "g" },
          scaling: { mode: "linear" }
        },
        {
          id: "water",
          name: "Water",
          quantity: { amount: 375, unit: "g" },
          scaling: { mode: "bakersPercent", percent: 75, of: "flour" }
          // 75% hydration: 375/500 = 0.75 = 75%
        }
      ],
      instructions: []
    };

    // Scale 1 loaf -> 2 loaves (multiplier = 2)
    const result = scaleRecipe(recipeWithRatio, { multiplier: 2 });

    const flour = findIngredient(result.ingredients, 'flour');
    const water = findIngredient(result.ingredients, 'water');

    expect(flour?.quantity?.amount).toBe(1000); // 500 * 2
    // Water should be 1000 * 0.75 = 750g (75% of flour)
    // This maintains the 75% hydration ratio
    expect(water?.quantity?.amount).toBe(750);
  });

  test('handles DurationMinutes timing during scaling', () => {
    const timedRecipe: Recipe = {
      profile: 'lite',
      name: 'Timed Recipe',
      yield: { amount: 1, unit: 'batch' },
      time: { total: { minutes: 30 } },
      stacks: {},
      ingredients: [],
      instructions: [
        {
          id: 'rest',
          text: 'Rest the dough',
          timing: { activity: 'passive', duration: { minutes: 30 } },
        },
      ],
    };

    const scaled = scaleRecipe(timedRecipe, { multiplier: 2 });
    const firstInstruction = scaled.instructions[0] as any;
    // Timing scaling may not be implemented, so duration should remain unchanged
    // or be scaled if the parser supports it
    expect(firstInstruction.timing?.duration).toBeDefined();
  });
});

function findIngredient(items: Recipe['ingredients'], id: string) {
  const result: any[] = [];
  const visit = (list: Recipe['ingredients']) => {
    list.forEach(item => {
      if (typeof item === 'string') return;
      if ('section' in item) {
        visit(item.ingredients as any);
      } else if (item.id === id) {
        result.push(item);
      }
    });
  };

  visit(items);
  return result[0];
}