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
});