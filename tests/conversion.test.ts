import { parseIngredientLine } from '../src/converters/ingredient';
import { fromSchemaOrg } from '../src/fromSchemaOrg';
import { toSchemaOrg } from '../src/toSchemaOrg';
import { Recipe } from '../src/types';

describe('ingredient parser', () => {
  it('parses common measurement formats', () => {
    expect(parseIngredientLine('2 cups flour').quantity).toEqual({
      amount: 2,
      unit: 'cup'
    });

    expect(parseIngredientLine('1/2 tsp salt').quantity).toEqual({
      amount: 0.5,
      unit: 'tsp'
    });

    expect(parseIngredientLine('2 1/4 cups sugar').quantity).toEqual({
      amount: 2.25,
      unit: 'cup'
    });

    expect(parseIngredientLine('3 large eggs').quantity).toEqual({
      amount: 3,
      unit: null
    });

    expect(parseIngredientLine('1 cup (225g) butter').quantity).toEqual({
      amount: 225,
      unit: 'g'
    });

    expect(parseIngredientLine('Salt to taste')).toMatchObject({
      name: 'Salt',
      notes: 'to taste'
    });

    expect(parseIngredientLine('2-3 cloves garlic, minced')).toMatchObject({
      quantity: { amount: 2, unit: null },
      name: 'garlic',
      prep: 'minced',
      notes: '2-3 cloves'
    });

    expect(parseIngredientLine('1 (14oz) can tomatoes')).toMatchObject({
      quantity: { amount: 14, unit: 'oz' },
      name: 'canned tomatoes'
    });

    expect(parseIngredientLine('Butter for greasing (optional)')).toMatchObject({
      name: 'Butter',
      notes: 'for greasing',
      optional: true
    });
  });
});

describe('Schema.org <-> Soustack', () => {
  const schemaOrgFixture = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: 'Perfect Chocolate Chip Cookies',
    description: 'Crispy edges, chewy center.',
    image: 'https://example.com/cookies.jpg',
    recipeIngredient: [
      '2 1/4 cups all-purpose flour, sifted',
      '1 cup (225g) butter, softened'
    ],
    recipeInstructions: [
      {
        '@type': 'HowToStep',
        text: 'Preheat oven to 375°F'
      },
      'Bake until golden brown'
    ],
    recipeYield: '24 cookies',
    prepTime: 'PT20M',
    cookTime: 'PT12M',
    totalTime: 'PT32M',
    recipeCategory: 'Dessert',
    recipeCuisine: ['American'],
    keywords: 'cookies, chocolate',
    author: { '@type': 'Person', name: 'Jane Baker' },
    publisher: { '@type': 'Organization', name: 'Test Kitchen', url: 'https://example.com' },
    nutrition: { calories: '250 cal' }
  };

  it('imports Schema.org JSON-LD into Soustack format', () => {
    const soustack = fromSchemaOrg(schemaOrgFixture);
    expect(soustack).not.toBeNull();

    const recipe = soustack as Recipe;
    expect(recipe.name).toBe('Perfect Chocolate Chip Cookies');
    expect(recipe.yield).toMatchObject({ amount: 24, unit: 'cookies' });
    expect(recipe.time).toMatchObject({ prep: 20, active: 12, total: 32 });
    expect(recipe.ingredients[0]).toMatchObject({
      name: 'all-purpose flour',
      quantity: { amount: 2.25, unit: 'cup' }
    });
    expect(recipe.instructions).toHaveLength(2);
    expect(recipe.category).toBe('Dessert');
    expect(recipe.tags).toEqual(expect.arrayContaining(['American', 'cookies', 'chocolate']));
    expect(recipe.source).toMatchObject({ author: 'Jane Baker', name: 'Test Kitchen' });
    expect(recipe.nutrition).toMatchObject({ calories: '250 cal' });
  });

  it('exports Soustack recipes to Schema.org JSON-LD', () => {
    const soustackRecipe: Recipe = {
      name: 'Test Bread',
      description: 'A demo loaf.',
      image: 'https://example.com/bread.jpg',
      category: 'Bread',
      tags: ['Italian', 'Holiday'],
      yield: { amount: 2, unit: 'loaves' },
      time: { prep: 30, active: 25, total: 120 },
      ingredients: [
        {
          item: '500g bread flour',
          quantity: { amount: 500, unit: 'g' },
          name: 'bread flour',
          scaling: { type: 'linear' }
        }
      ],
      instructions: [
        { text: 'Mix ingredients' },
        { text: 'Bake until brown' }
      ],
      source: {
        author: 'Chef Example',
        name: 'Soustack Kitchen',
        url: 'https://soustack.dev'
      }
    };

    const schemaOrg = toSchemaOrg(soustackRecipe);

    expect(schemaOrg).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Test Bread',
      prepTime: 'PT30M',
      cookTime: 'PT25M',
      totalTime: 'PT2H',
      recipeYield: '2 loaves',
      recipeCategory: 'Bread'
    });

    expect(schemaOrg.recipeIngredient).toEqual(
      expect.arrayContaining(['500g bread flour'])
    );
    expect(Array.isArray(schemaOrg.recipeInstructions)).toBe(true);
    expect(schemaOrg.recipeInstructions).toHaveLength(2);
  });
});
