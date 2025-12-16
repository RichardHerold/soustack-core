import { scaleRecipe } from '../src/parser';
import { Recipe } from '../src/types';

// The "Sourdough Stress Test" Data
const sourdough: Recipe = {
  name: "Rustic Sourdough",
  yield: { amount: 1, unit: "loaf" },
  ingredients: [
    {
      id: "flour",
      item: "500g Bread Flour",
      quantity: { amount: 500, unit: "g" },
      scaling: { type: "linear" }
    },
    {
      id: "salt",
      item: "10g Salt (2%)",
      quantity: { amount: 10, unit: "g" },
      scaling: { type: "bakers_percentage", referenceId: "flour", factor: 0.02 }
    }
  ],
  instructions: []
};

describe('Soustack Logic Engine', () => {
  test('scales linear ingredients (flour) correctly', () => {
    // Scale 1 loaf -> 2 loaves
    const result = scaleRecipe(sourdough, 2);
    
    const flour = result.ingredients.find(i => i.id === 'flour');
    expect(flour?.amount).toBe(1000); // 500 * 2
  });

  test('scales bakers percentage (salt) correctly', () => {
    // Scale 1 loaf -> 2 loaves
    const result = scaleRecipe(sourdough, 2);

    const salt = result.ingredients.find(i => i.id === 'salt');
    // Salt should be 20g (2% of the NEW flour weight, which is 1000g)
    expect(salt?.amount).toBe(20);
  });

  test('scales bakers percentage without factor (calculates ratio)', () => {
    // Test case where factor is not provided - should calculate from original amounts
    const recipeWithRatio: Recipe = {
      name: "Test Recipe",
      yield: { amount: 1, unit: "loaf" },
      ingredients: [
        {
          id: "flour",
          item: "500g Bread Flour",
          quantity: { amount: 500, unit: "g" },
          scaling: { type: "linear" }
        },
        {
          id: "water",
          item: "375g Water (75% hydration)",
          quantity: { amount: 375, unit: "g" },
          scaling: { type: "bakers_percentage", referenceId: "flour" }
          // No factor provided - should calculate ratio: 375/500 = 0.75
        }
      ],
      instructions: []
    };

    // Scale 1 loaf -> 2 loaves (multiplier = 2)
    const result = scaleRecipe(recipeWithRatio, 2);
    
    const flour = result.ingredients.find(i => i.id === 'flour');
    const water = result.ingredients.find(i => i.id === 'water');
    
    expect(flour?.amount).toBe(1000); // 500 * 2
    // Water should be 1000 * (375/500) = 1000 * 0.75 = 750g
    // This maintains the 75% hydration ratio
    expect(water?.amount).toBe(750);
  });

  test('handles ISO8601 timing strings during scaling', () => {
    const isoRecipe: Recipe = {
      name: 'ISO Timing',
      yield: { amount: 1, unit: 'batch' },
      ingredients: [],
      instructions: [
        {
          text: 'Rest the dough',
          timing: { duration: 'PT30M', type: 'passive', scaling: 'linear' },
        },
      ],
    };

    const scaled = scaleRecipe(isoRecipe, 2);
    expect(scaled.instructions[0].durationMinutes).toBe(60);
    expect(scaled.timing.passive).toBe(60);
  });
});