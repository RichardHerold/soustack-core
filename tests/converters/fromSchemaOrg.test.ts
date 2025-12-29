import { fromSchemaOrg } from '../../src/fromSchemaOrg';
import { Recipe } from '../../src/types';
import { validateRecipe } from '../../src/validator';
import { CANONICAL_ROOT_SCHEMA_URL } from '../../src/schemaMetadata';

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

  it('converts nutrition to vNext format', () => {
    const withNutrition = getRecipe({ nutrition: { calories: '200 cal' } });
    const withoutNutrition = getRecipe({ nutrition: 'invalid' });
    const missingNutrition = getRecipe();

    // vNext: nutrition is directly on recipe, parsed as numbers
    expect(withNutrition.nutrition).toEqual({ calories: 200 });
    expect(withoutNutrition.nutrition).toBeUndefined();
    expect(withoutNutrition).not.toHaveProperty('nutrition');
    expect(missingNutrition).not.toHaveProperty('nutrition');
  });
});

describe('image handling', () => {
  it('captures string recipe images', () => {
    const recipe = getRecipe({ image: 'https://example.com/one.jpg' });
    expect(recipe.images).toEqual(['https://example.com/one.jpg']);
  });

  it('preserves multiple recipe images as arrays', () => {
    const recipe = getRecipe({
      image: ['https://example.com/a.jpg', 'https://example.com/b.jpg']
    });
    expect(recipe.images).toEqual(['https://example.com/a.jpg', 'https://example.com/b.jpg']);
  });

  it('extracts URLs from image objects', () => {
    const recipe = getRecipe({ image: { url: 'https://example.com/object.jpg' } });
    expect(recipe.images).toEqual(['https://example.com/object.jpg']);
  });

  it('normalizes mixed image arrays', () => {
    const recipe = getRecipe({
      image: [{ url: 'https://example.com/object.jpg' }, 'https://example.com/string.jpg']
    });
    expect(recipe.images).toEqual([
      'https://example.com/object.jpg',
      'https://example.com/string.jpg'
    ]);
  });

  it('returns undefined when no valid image exists', () => {
    expect(convert({ image: { invalid: true } as any })?.images).toBeUndefined();
    expect(convert({ image: null })?.images).toBeUndefined();
  });

  it('uses contentUrl when url is unavailable', () => {
    const recipe = getRecipe({ image: { contentUrl: 'https://example.com/content.jpg' } });
    expect(recipe.images).toEqual(['https://example.com/content.jpg']);
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
  it('captures ingredient strings and ignores blanks', () => {
    const recipe = getRecipe({
      recipeIngredient: [' 2 cups sugar ', '', '1 tsp salt']
    });

    expect(recipe.ingredients).toEqual([
      { name: '2 cups sugar', scaling: { mode: 'linear' } },
      { name: '1 tsp salt', scaling: { mode: 'linear' } }
    ]);
  });

  it('handles single string values', () => {
    const recipe = getRecipe({ recipeIngredient: '3 large eggs' });
    expect(recipe.ingredients).toEqual([{ name: '3 large eggs', scaling: { mode: 'linear' } }]);
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

  it('creates sections for HowToSection entries', () => {
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
        section: 'Prep',
        steps: ['Gather tools', 'Chop veggies']
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
        section: 'Main',
        steps: ['Inner step']
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
      { text: 'Snap photo', images: ['https://example.com/step.jpg'] }
    ]);
  });

  it('retains structured timing and ids when present', () => {
    const recipe = getRecipe({
      recipeInstructions: [
        {
          '@type': 'HowToStep',
          text: 'Let rest',
          totalTime: 'PT30M',
          '@id': 'step1'
        }
      ]
    });

    expect(recipe.instructions).toEqual([
      { text: 'Let rest', timing: { activity: 'active', duration: { minutes: 30 } }, id: 'step1' }
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
      { text: 'Prep', images: ['https://example.com/prep.jpg'] },
      'Cook',
      'Serve'
    ]);
  });
});

describe('context tolerance', () => {
  const contexts = [
    'http://schema.org',
    'https://schema.org/',
    ['https://schema.org', { '@vocab': 'http://schema.org/' }],
    { '@vocab': 'https://schema.org/' }
  ];

  it.each(contexts)('accepts @context variant %p', contextValue => {
    const result = fromSchemaOrg({
      '@context': contextValue as any,
      '@type': 'Recipe',
      name: 'Context Recipe'
    });

    expect(result?.name).toBe('Context Recipe');
  });

  it('detects recipe nodes in graphs regardless of context', () => {
    const result = fromSchemaOrg({
      '@context': { '@vocab': 'https://schema.org/' },
      '@graph': [
        { '@type': 'Article', name: 'Ignore' },
        { '@type': 'Recipe', name: 'Graph Recipe' }
      ]
    });

    expect(result?.name).toBe('Graph Recipe');
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

    // vNext: time uses DurationMinutes format
    expect(recipe.time).toMatchObject({ total: { minutes: 80 } });
    expect(recipe.yield).toMatchObject({ amount: 24, unit: 'cookies' });
  });

  it('sums prep and cook time when totalTime is missing', () => {
    const recipe = getRecipe({
      prepTime: 'PT15M',
      cookTime: 'PT30M',
      totalTime: undefined
    });

    expect(recipe.time).toMatchObject({ total: { minutes: 45 } });
  });

  it('sets profile to base when both time and yield are available', () => {
    const recipe = getRecipe({
      totalTime: 'PT15M',
      recipeYield: '4 servings'
    });

    expect(recipe.profile).toBe('base');
  });

  it('omits time when no values parse', () => {
    const recipe = getRecipe({ prepTime: 'invalid', cookTime: undefined, totalTime: undefined });
    expect(recipe.time).toBeUndefined();
  });
});

describe('lite profile and vNext format', () => {
  const schemaOrgSample = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: 'Lite Profile Lasagna',
    description: 'A hearty lasagna.',
    url: 'https://example.com/lasagna',
    author: { '@type': 'Person', name: 'Chef Example' },
    datePublished: '2024-04-20T12:00:00Z',
    recipeCategory: 'Dinner',
    recipeCuisine: 'Italian',
    keywords: 'pasta, cheese, baked',
    image: ['https://example.com/lasagna.jpg'],
    video: 'https://example.com/lasagna.mp4',
    recipeIngredient: ['2 cups sauce', '1 lb noodles'],
    recipeInstructions: ['Layer ingredients', 'Bake until done'],
    prepTime: 'PT20M',
    cookTime: 'PT40M',
    totalTime: 'PT1H',
    nutrition: {
      calories: '400 kcal',
      proteinContent: '20 g'
    }
  } as const;

  it('defaults to lite profile with vNext format and validates', () => {
    const soustack = fromSchemaOrg(schemaOrgSample);
    expect(soustack).not.toBeNull();
    const recipe = soustack as Recipe;

    expect(recipe.profile).toBe('lite');
    // vNext: no legacy stacks
    expect(recipe.stacks).toEqual({});

    // vNext: source is directly on recipe
    expect(recipe.source).toEqual(
      expect.objectContaining({
        url: 'https://example.com/lasagna',
        author: 'Chef Example'
      })
    );
    // vNext: category and tags are directly on recipe
    expect(recipe.category).toBe('Dinner');
    expect(recipe.tags).toEqual(expect.arrayContaining(['Italian', 'pasta', 'cheese', 'baked']));
    // vNext: image is directly on recipe (may be string or array)
    expect(recipe.images).toEqual(expect.arrayContaining(['https://example.com/lasagna.jpg']));
    expect(recipe.videos).toEqual(['https://example.com/lasagna.mp4']);
    // vNext: time uses DurationMinutes format
    expect(recipe.time).toMatchObject({ total: { minutes: 60 } });
    // vNext: nutrition is directly on recipe
    expect(recipe.nutrition).toMatchObject({ calories: 400 });

    const validation = validateRecipe(recipe);
    expect(validation.ok).toBe(true);
  });

  it('emits the canonical $schema when converting Schema.org recipes', () => {
    const soustack = fromSchemaOrg(schemaOrgSample);
    expect(soustack).not.toBeNull();
    expect((soustack as Recipe).$schema).toBe(CANONICAL_ROOT_SCHEMA_URL);
  });

  it('does not emit legacy schema URLs', () => {
    const soustack = fromSchemaOrg(schemaOrgSample);
    expect(soustack).not.toBeNull();
    const schema = (soustack as Recipe).$schema;
    expect(schema).not.toContain('https://soustack.spec/');
    expect(schema).not.toContain('https://soustack.ai/schemas/');
  });
});
