import fs from 'fs';
import path from 'path';
import { scaleRecipe } from '../src/parser';
import { Ingredient, Recipe } from '../src/types';

const fixturePath = path.join(__dirname, '..', 'spec', 'fixtures', 'scalable', 'valid', 'scaling-modes.json');
const scalingModesFixture: Recipe = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

describe('scaleRecipe', () => {
  test('scales each ingredient mode deterministically', () => {
    const scaled = scaleRecipe(scalingModesFixture, { multiplier: 3 });

    expect(findIngredient(scaled.ingredients, 'linear')?.quantity?.amount).toBe(300);
    expect(findIngredient(scaled.ingredients, 'fixed')?.quantity?.amount).toBe(5);
    expect(findIngredient(scaled.ingredients, 'discrete')?.quantity?.amount).toBe(3);
    expect(findIngredient(scaled.ingredients, 'discrete_step')?.quantity?.amount).toBe(6);
    expect(findIngredient(scaled.ingredients, 'proportional')?.quantity?.amount).toBe(15);
    expect(findIngredient(scaled.ingredients, 'starter')?.quantity?.amount).toBe(150);
    expect(findIngredient(scaled.ingredients, 'salt')?.quantity?.amount).toBeCloseTo(6);
  });

  test('uses target yield to derive multiplier', () => {
    const scaled = scaleRecipe(scalingModesFixture, { targetYield: { amount: 2 } });

    expect(scaled.yield?.amount).toBe(2);
    expect(findIngredient(scaled.ingredients, 'linear')?.quantity?.amount).toBe(200);
  });

  test('scales instruction timing across subsections', () => {
    const scaled = scaleRecipe(scalingModesFixture, { multiplier: 3 });

    expect(findInstruction(scaled.instructions, 'rest')?.timing?.duration).toBe(90);
    expect(findInstruction(scaled.instructions, 'bake')?.timing?.duration).toBe(35);
  });

  test("throws when baker's percentage ingredient lacks a referenceId", () => {
    const recipe: Recipe = {
      name: 'Bad Bakers',
      yield: { amount: 1, unit: 'loaf' },
      ingredients: [
        {
          id: 'salt',
          item: '2g Salt',
          quantity: { amount: 2, unit: 'g' },
          scaling: { type: 'bakers_percentage' } as any
        }
      ],
      instructions: []
    };

    expect(() => scaleRecipe(recipe, { multiplier: 2 })).toThrow(/referenceId/);
  });
});

function findIngredient(items: Recipe['ingredients'], id: string): Ingredient | undefined {
  for (const item of items) {
    if (typeof item === 'string') continue;
    if ('subsection' in item) {
      const match: Ingredient | undefined = findIngredient(item.items as any, id);
      if (match) return match;
    } else if (item.id === id) {
      return item;
    }
  }

  return undefined;
}

function findInstruction(items: Recipe['instructions'], id: string): any {
  for (const item of items) {
    if (typeof item === 'string') continue;
    if ('subsection' in item) {
      const match = findInstruction(item.items as any, id);
      if (match) return match;
    } else if (item.id === id) {
      return item;
    }
  }

  return undefined;
}
