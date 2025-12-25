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
    // vNext: time uses DurationMinutes format
    expect(recipe.time).toMatchObject({ total: { minutes: 32 } });
    expect(recipe.ingredients).toEqual([
      { name: '2 1/4 cups all-purpose flour, sifted', scaling: { mode: 'linear' } },
      { name: '1 cup (225g) butter, softened', scaling: { mode: 'linear' } }
    ]);
    expect(recipe.instructions).toHaveLength(2);
    expect(recipe.category).toBe('Dessert');
    expect(recipe.tags).toEqual(expect.arrayContaining(['American', 'cookies', 'chocolate']));
    expect(recipe.source).toMatchObject({ author: 'Jane Baker', name: 'Test Kitchen' });
    // vNext: nutrition is directly on recipe, not in stack
    expect(recipe.nutrition).toMatchObject({ calories: 250 });
    expect(recipe.images).toEqual(['https://example.com/cookies.jpg']);
  });

  it('round-trips Schema.org through Lite validation', () => {
    const soustack = fromSchemaOrg(schemaOrgFixture);
    expect(soustack).not.toBeNull();

    // Ensure profile is set
    const recipe = soustack as Recipe;
    expect(recipe.profile).toBe('base');

    const validation = validateRecipe(recipe, { profile: recipe.profile });
    expect(validation.ok).toBe(true);

    const schema = toSchemaOrg(validation.normalizedRecipe!);
    expect(schema['@type']).toBe('Recipe');
    expect(schema.recipeIngredient).toEqual(
      expect.arrayContaining(['2 1/4 cups all-purpose flour, sifted'])
    );
  });

  it('exports Soustack recipes to Schema.org JSON-LD', () => {
    const soustackRecipe: Recipe = {
      '@type': 'Recipe',
      profile: 'base',
      stacks: {},
      name: 'Test Bread',
      description: 'A demo loaf.',
      images: ['https://example.com/bread.jpg'],
      category: 'Bread',
      tags: ['Italian', 'Holiday'],
      yield: { amount: 2, unit: 'loaves' },
      time: { total: { minutes: 120 } },
      ingredients: [
        {
          name: 'bread flour',
          quantity: { amount: 500, unit: 'g' },
          scaling: { mode: 'linear' }
        }
      ],
      instructions: [
        { id: 'mix', text: 'Mix ingredients' },
        { id: 'bake', text: 'Bake until brown' }
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
      totalTime: 'PT2H',
      recipeYield: '2 loaves'
      // recipeCategory may or may not be included depending on converter implementation
    });

    expect(schemaOrg.recipeIngredient).toEqual(
      expect.arrayContaining(['bread flour'])
    );
    expect(Array.isArray(schemaOrg.recipeInstructions)).toBe(true);
    expect(schemaOrg.recipeInstructions).toHaveLength(2);
  });
});
