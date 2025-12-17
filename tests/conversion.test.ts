import { parseIngredientLine } from '../src/converters/ingredient';
import { fromSchemaOrg } from '../src/fromSchemaOrg';
import { toSchemaOrg } from '../src/toSchemaOrg';
import { Recipe } from '../src/types';
import { validateRecipe } from '../src/validator';

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
    expect(recipe.times).toMatchObject({ prepMinutes: 20, cookMinutes: 12, totalMinutes: 32 });
    expect(recipe.ingredients[0]).toBe('2 1/4 cups all-purpose flour, sifted');
    expect(recipe.instructions).toHaveLength(2);
    expect(recipe.category).toBe('Dessert');
    expect(recipe.tags).toEqual(expect.arrayContaining(['American', 'cookies', 'chocolate']));
    expect(recipe.source).toMatchObject({ author: 'Jane Baker', name: 'Test Kitchen' });
    // v0.3: nutrition values are parsed as numbers
    expect(recipe.nutrition).toMatchObject({ calories: 250 });
  });

  it('round-trips Schema.org through Base validation', () => {
    const soustack = fromSchemaOrg(schemaOrgFixture);
    expect(soustack).not.toBeNull();

    // Remove properties that aren't in the core profile or require modules
    const { dateModified, nutrition, times, ...baseCompatible } = soustack as any;
    // Ensure @type and profile are present
    if (!baseCompatible['@type']) {
      baseCompatible['@type'] = 'Recipe';
    }
    // Remove modules that require fields we removed
    if (baseCompatible.modules) {
      baseCompatible.modules = baseCompatible.modules.filter((m: string) => 
        m !== 'times@1' && m !== 'nutrition@1'
      );
    }
    baseCompatible.profile = 'core';
    const validation = validateRecipe(baseCompatible, { profile: 'core' });
    expect(validation.valid).toBe(true);

    const schema = toSchemaOrg(validation.normalized!);
    expect(schema['@type']).toBe('Recipe');
    expect(schema.recipeIngredient).toEqual(
      expect.arrayContaining(['2 1/4 cups all-purpose flour, sifted'])
    );
  });

  it('exports Soustack recipes to Schema.org JSON-LD', () => {
    const soustackRecipe: Recipe = {
      '@type': 'Recipe',
      profile: 'minimal',
      modules: ['taxonomy@1', 'times@1'], // Declare modules for category/tags and time
      name: 'Test Bread',
      description: 'A demo loaf.',
      image: 'https://example.com/bread.jpg',
      category: 'Bread',
      tags: ['Italian', 'Holiday'],
      yield: { amount: 2, unit: 'loaves' },
      times: { prepMinutes: 30, cookMinutes: 25, totalMinutes: 120 },
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
