import { fromSchemaOrg } from '../../src/fromSchemaOrg';
import { Recipe } from '../../src/types';

const baseSchemaOrg = {
  '@type': 'Recipe',
  name: 'Test Recipe',
  recipeIngredient: ['1 cup flour'],
  recipeInstructions: ['Mix ingredients']
} as const;

function convert(overrides: Record<string, unknown> = {}) {
  return fromSchemaOrg({ ...baseSchemaOrg, ...overrides });
}

function getRecipe(overrides: Record<string, unknown> = {}): Recipe {
  const result = convert(overrides);
  expect(result).not.toBeNull();
  return result as Recipe;
}

describe('fromSchemaOrg validation', () => {
  it('returns null for null or undefined input', () => {
    expect(fromSchemaOrg(null)).toBeNull();
    expect(fromSchemaOrg(undefined)).toBeNull();
  });

  it('returns null for non-object inputs', () => {
    expect(fromSchemaOrg('recipe')).toBeNull();
    expect(fromSchemaOrg(42)).toBeNull();
  });

  it('requires @type including Recipe', () => {
    expect(convert({ '@type': 'Article' })).toBeNull();
    expect(convert({ '@type': ['HowTo', 'Article'] })).toBeNull();
    expect(convert({ '@type': ['Article', 'Recipe'] })).not.toBeNull();
  });

  it('requires a non-empty name', () => {
    expect(fromSchemaOrg({ '@type': 'Recipe' })).toBeNull();
    expect(convert({ name: '   ' })).toBeNull();
    expect(convert({ name: 'Valid Name' })).not.toBeNull();
  });

  it('handles arrays of Schema.org nodes', () => {
    const result = fromSchemaOrg([
      { '@type': 'Article', name: 'Ignore me' },
      { ...baseSchemaOrg, name: 'Array Recipe' }
    ]);
    expect(result?.name).toBe('Array Recipe');
  });

  it('handles @graph containers', () => {
    const result = fromSchemaOrg({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Article', name: 'Other' },
        { ...baseSchemaOrg, name: 'Graph Recipe' }
      ]
    });
    expect(result?.name).toBe('Graph Recipe');
  });
});

describe('metadata mapping', () => {
  it('maps description, dates, and category', () => {
    const recipe = getRecipe({
      description: '  A tasty treat  ',
      datePublished: '2024-01-01',
      dateModified: '2024-02-01',
      recipeCategory: ['Dessert']
    });

    expect(recipe.description).toBe('A tasty treat');
    expect(recipe.dateAdded).toBe('2024-01-01');
    expect(recipe.dateModified).toBe('2024-02-01');
    expect(recipe.category).toBe('Dessert');
  });

  it('builds tags from cuisine and keywords', () => {
    const recipe = getRecipe({
      recipeCuisine: ['Italian', 'Dinner'],
      keywords: 'pasta, vegetarian | easy'
    });

    expect(recipe.tags).toEqual(expect.arrayContaining(['Italian', 'pasta', 'vegetarian', 'easy']));
  });

  it('passes through nutrition objects only', () => {
    const withNutrition = getRecipe({ nutrition: { calories: '200' } });
    const withoutNutrition = getRecipe({ nutrition: 'invalid' });

    expect(withNutrition.nutrition).toEqual({ calories: '200' });
    expect(withoutNutrition.nutrition).toBeUndefined();
  });
});

describe('image handling', () => {
  it('captures string recipe images', () => {
    const recipe = getRecipe({ image: 'https://example.com/one.jpg' });
    expect(recipe.image).toBe('https://example.com/one.jpg');
  });

  it('preserves multiple recipe images as arrays', () => {
    const recipe = getRecipe({
      image: ['https://example.com/a.jpg', 'https://example.com/b.jpg']
    });
    expect(recipe.image).toEqual(['https://example.com/a.jpg', 'https://example.com/b.jpg']);
  });

  it('extracts URLs from image objects', () => {
    const recipe = getRecipe({ image: { url: 'https://example.com/object.jpg' } });
    expect(recipe.image).toBe('https://example.com/object.jpg');
  });

  it('normalizes mixed image arrays', () => {
    const recipe = getRecipe({
      image: [{ url: 'https://example.com/object.jpg' }, 'https://example.com/string.jpg']
    });
    expect(recipe.image).toEqual([
      'https://example.com/object.jpg',
      'https://example.com/string.jpg'
    ]);
  });

  it('returns undefined when no valid image exists', () => {
    expect(convert({ image: { invalid: true } as any })?.image).toBeUndefined();
    expect(convert({ image: null })?.image).toBeUndefined();
  });

  it('uses contentUrl when url is unavailable', () => {
    const recipe = getRecipe({ image: { contentUrl: 'https://example.com/content.jpg' } });
    expect(recipe.image).toBe('https://example.com/content.jpg');
  });
});

describe('source mapping', () => {
  it('extracts author and publisher names from strings and objects', () => {
    const recipe = getRecipe({
      author: { name: 'Chef Object' },
      publisher: 'Publisher String',
      url: 'https://example.com/recipe'
    });

    expect(recipe.source).toEqual({
      author: 'Chef Object',
      name: 'Publisher String',
      url: 'https://example.com/recipe'
    });
  });

  it('handles arrays and mainEntityOfPage fallbacks', () => {
    const recipe = getRecipe({
      author: ['First Author', { name: 'Second Author' }],
      publisher: [{ name: 'First Publisher' }, 'Second Publisher'],
      url: undefined,
      mainEntityOfPage: 'https://example.com/page'
    });

    expect(recipe.source).toEqual({
      author: 'First Author',
      name: 'First Publisher',
      url: 'https://example.com/page'
    });
  });

  it('omits source when no fields are available', () => {
    const recipe = getRecipe({ author: undefined, publisher: undefined, url: undefined });
    expect(recipe.source).toBeUndefined();
  });
});

describe('ingredient conversion', () => {
  it('parses ingredient strings and ignores blanks', () => {
    const recipe = getRecipe({
      recipeIngredient: [' 2 cups sugar ', '', '1 tsp salt']
    });

    expect(recipe.ingredients).toHaveLength(2);
    expect(recipe.ingredients[0]).toMatchObject({
      quantity: { amount: 2, unit: 'cup' },
      name: 'sugar'
    });
  });

  it('handles single string values', () => {
    const recipe = getRecipe({ recipeIngredient: '3 large eggs' });
    expect(recipe.ingredients[0]).toMatchObject({
      item: '3 large eggs',
      quantity: { amount: 3 }
    });
  });
});

describe('instruction conversion', () => {
  it('accepts string arrays and single strings', () => {
    expect(convert({ recipeInstructions: ['Step 1', 'Step 2'] })?.instructions).toEqual([
      'Step 1',
      'Step 2'
    ]);
    expect(convert({ recipeInstructions: 'Only step' })?.instructions).toEqual(['Only step']);
  });

  it('converts HowToStep entries to text', () => {
    const instructions = convert({
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Preheat oven' },
        { '@type': 'HowToStep', name: 'Mix batter' }
      ]
    })?.instructions;

    expect(instructions).toEqual(['Preheat oven', 'Mix batter']);
  });

  it('creates subsections for HowToSection entries', () => {
    const instructions = convert({
      recipeInstructions: [
        {
          '@type': 'HowToSection',
          name: 'Prep',
          itemListElement: [
            'Gather tools',
            { '@type': 'HowToStep', text: 'Chop veggies' }
          ]
        }
      ]
    })?.instructions;

    expect(instructions).toEqual([
      {
        subsection: 'Prep',
        items: ['Gather tools', 'Chop veggies']
      }
    ]);
  });

  it('flattens nested sections and drops empty steps', () => {
    const instructions = convert({
      recipeInstructions: [
        {
          '@type': 'HowToSection',
          name: 'Main',
          itemListElement: [
            '  ',
            {
              '@type': 'HowToSection',
              name: 'Nested',
              itemListElement: [{ '@type': 'HowToStep', text: 'Inner step' }]
            }
          ]
        }
      ]
    })?.instructions;

    expect(instructions).toEqual([
      {
        subsection: 'Main',
        items: ['Inner step']
      }
    ]);
  });

  it('creates instruction objects when HowToStep includes an image', () => {
    const recipe = getRecipe({
      recipeInstructions: [
        {
          '@type': 'HowToStep',
          text: 'Snap photo',
          image: 'https://example.com/step.jpg'
        }
      ]
    });

    expect(recipe.instructions).toEqual([
      { text: 'Snap photo', image: 'https://example.com/step.jpg' }
    ]);
  });

  it('keeps instructions as strings when no image metadata exists', () => {
    const recipe = getRecipe({
      recipeInstructions: [{ '@type': 'HowToStep', text: 'Bake' }]
    });

    expect(recipe.instructions).toEqual(['Bake']);
  });

  it('mixes object and string instructions depending on image availability', () => {
    const recipe = getRecipe({
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Prep', image: 'https://example.com/prep.jpg' },
        { '@type': 'HowToStep', text: 'Cook' },
        'Serve'
      ]
    });

    expect(recipe.instructions).toEqual([
      { text: 'Prep', image: 'https://example.com/prep.jpg' },
      'Cook',
      'Serve'
    ]);
  });
});

describe('time and yield parsing', () => {
  it('parses ISO8601 times and yield strings', () => {
    const recipe = getRecipe({
      prepTime: 'PT20M',
      cookTime: 'PT1H',
      totalTime: 'PT80M',
      recipeYield: '24 cookies'
    });

    expect(recipe.time).toEqual({ prep: 20, active: 60, total: 80 });
    expect(recipe.yield).toEqual({ amount: 24, unit: 'cookies', description: '24 cookies' });
  });

  it('omits time when no values parse', () => {
    const recipe = getRecipe({ prepTime: 'invalid', cookTime: undefined, totalTime: undefined });
    expect(recipe.time).toBeUndefined();
  });
});
