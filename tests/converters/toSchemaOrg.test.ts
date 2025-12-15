import {
  cleanOutput,
  convertAuthor,
  convertBasicMetadata,
  convertCategoryTags,
  convertIngredients,
  convertInstructions,
  convertNutrition,
  convertTime,
  convertYield,
  toSchemaOrg
} from '../../src/converters/toSchemaOrg';
import { fromSchemaOrg } from '../../src/fromSchemaOrg';
import { Recipe } from '../../src/types';
import { HowToSection, HowToStep, SchemaOrgRecipe } from '../../src/types/schemaOrg';

function buildRecipe(overrides: Partial<Recipe> = {}): Recipe {
  const base: Recipe = {
    name: 'Sample Recipe',
    description: 'Base description',
    category: 'Dessert',
    tags: ['Sweet', 'Baking'],
    image: 'https://example.com/image.jpg',
    dateAdded: '2024-01-01',
    dateModified: '2024-02-01',
    source: { author: 'Test Author', name: 'Test Kitchen', url: 'https://example.com' },
    yield: { amount: 8, unit: 'servings' },
    time: { prep: 15, active: 30, total: 45 },
    nutrition: { calories: '200 cal' },
    ingredients: ['1 cup sugar'],
    instructions: ['Mix everything']
  };

  return {
    ...base,
    ...overrides,
    ingredients: overrides.ingredients ?? base.ingredients,
    instructions: overrides.instructions ?? base.instructions
  };
}

const step = (text: string, image?: string): HowToStep => ({
  '@type': 'HowToStep',
  text,
  ...(image ? { image } : {})
});

describe('convertBasicMetadata', () => {
  const cases: Array<{
    name: string;
    recipe: Recipe;
    expected: Partial<SchemaOrgRecipe>;
    absent?: string[];
  }> = [
    {
      name: 'includes required context and type',
      recipe: buildRecipe({ name: 'Cookies' }),
      expected: {
        '@context': 'https://schema.org',
        '@type': 'Recipe',
        name: 'Cookies'
      }
    },
    {
      name: 'includes optional description and image',
      recipe: buildRecipe({ description: 'Tasty', image: 'https://img.test/pic.jpg' }),
      expected: {
        description: 'Tasty',
        image: 'https://img.test/pic.jpg'
      }
    },
    {
      name: 'maps source URL',
      recipe: buildRecipe({ source: { url: 'https://blog.test/recipe' } }),
      expected: {
        url: 'https://blog.test/recipe'
      }
    },
    {
      name: 'maps dateAdded to datePublished',
      recipe: buildRecipe({ dateAdded: '2024-03-15' }),
      expected: {
        datePublished: '2024-03-15'
      }
    },
    {
      name: 'omits undefined optional fields',
      recipe: buildRecipe({ description: undefined, image: undefined }),
      expected: {},
      absent: ['description', 'image']
    }
  ];

  it.each(cases)('%s', ({ recipe, expected, absent = [] }) => {
    const result = convertBasicMetadata(recipe);
    expect(result).toMatchObject(expected);
    absent.forEach((key: string) => expect(result).not.toHaveProperty(key));
  });
});

describe('convertIngredients', () => {
  const cases = [
    {
      name: 'returns trimmed strings',
      input: [' 2 cups flour '],
      expected: ['2 cups flour']
    },
    {
      name: 'extracts item from ingredient objects',
      input: [{ item: '1 cup sugar', name: 'sugar' }],
      expected: ['1 cup sugar']
    },
    {
      name: 'preserves order across mixed entries',
      input: ['1 cup sugar', { item: '2 cups flour' }],
      expected: ['1 cup sugar', '2 cups flour']
    },
    {
      name: 'filters blank entries',
      input: [''],
      expected: []
    },
    {
      name: 'flattens subsection with strings',
      input: [{ subsection: 'Frosting', items: ['1 cup sugar'] }],
      expected: ['1 cup sugar']
    },
    {
      name: 'flattens subsection with ingredient objects',
      input: [{ subsection: 'Dough', items: [{ item: '2 eggs' }] }],
      expected: ['2 eggs']
    },
    {
      name: 'ignores undefined entries',
      input: [undefined, { item: 'Pinch of salt' }]
    }
  ] as Array<{
    name: string;
    input: any[];
    expected?: string[];
  }>;

  it.each(cases)('%s', ({ input, expected = ['Pinch of salt'] }) => {
    const result = convertIngredients(input as any);
    expect(result).toEqual(expected);
  });
});

describe('convertInstructions', () => {
  const cases = [
    {
      name: 'converts string steps',
      input: ['Mix', 'Bake'],
      expected: [step('Mix'), step('Bake')]
    },
    {
      name: 'converts instruction objects',
      input: [{ text: 'Fold gently' }],
      expected: [step('Fold gently')]
    },
    {
      name: 'creates HowToSection from subsection strings',
      input: [{ subsection: 'Prep', items: ['Gather ingredients'] }],
      expected: [
        {
          '@type': 'HowToSection',
          name: 'Prep',
          itemListElement: [step('Gather ingredients')]
        }
      ]
    },
    {
      name: 'creates HowToSection from subsection instructions',
      input: [{ subsection: 'Bake', items: [{ text: 'Preheat oven' }, { text: 'Bake' }] }],
      expected: [
        {
          '@type': 'HowToSection',
          name: 'Bake',
          itemListElement: [step('Preheat oven'), step('Bake')]
        }
      ]
    },
    {
      name: 'skips empty subsection entries',
      input: [{ subsection: 'Filling', items: [' ', { text: '' }] }],
      expected: []
    },
    {
      name: 'ignores undefined items',
      input: ['Mix', undefined, { text: 'Bake' }],
      expected: [step('Mix'), step('Bake')]
    },
    {
      name: 'trims step text',
      input: ['  Stir  '],
      expected: [step('Stir')]
    },
    {
      name: 'falls back to string conversion for unexpected objects',
      input: [{ foo: 'bar' }],
      expected: [step('[object Object]')]
    },
    {
      name: 'preserves mixed sections and steps order',
      input: [
        'Start',
        { subsection: 'Section', items: ['Do work'] },
        { text: 'Finish' }
      ],
      expected: [
        step('Start'),
        {
          '@type': 'HowToSection',
          name: 'Section',
          itemListElement: [step('Do work')]
        },
        step('Finish')
      ]
    },
    {
      name: 'drops subsection when no valid items',
      input: [{ subsection: 'Empty', items: [] }],
      expected: []
    },
    {
      name: 'includes instruction images when present',
      input: [{ text: 'Decorate', image: 'https://example.com/step.jpg' }],
      expected: [step('Decorate', 'https://example.com/step.jpg')]
    }
  ] as Array<{
    name: string;
    input: any[];
    expected: Array<HowToStep | HowToSection>;
  }>;

  it.each(cases)('%s', ({ input, expected }) => {
    expect(convertInstructions(input as any)).toEqual(expected);
  });
});

describe('convertTime', () => {
  const cases = [
    {
      name: 'formats structured time fields',
      input: { prep: 20, active: 30, total: 55 },
      expected: { prepTime: 'PT20M', cookTime: 'PT30M', totalTime: 'PT55M' }
    },
    {
      name: 'formats long prep to hours and minutes',
      input: { prep: 90 },
      expected: { prepTime: 'PT1H30M' }
    },
    {
      name: 'passes through simple time strings',
      input: { prepTime: 'PT10M', cookTime: 'PT20M' },
      expected: { prepTime: 'PT10M', cookTime: 'PT20M' }
    },
    {
      name: 'supports zero durations',
      input: { active: 0 },
      expected: { cookTime: 'PT0M' }
    },
    {
      name: 'returns empty object when time missing',
      input: undefined,
      expected: {}
    },
    {
      name: 'ignores passive-only timings',
      input: { passive: 30 },
      expected: {}
    }
  ] as const;

  it.each(cases)('%s', ({ input, expected }) => {
    expect(convertTime(input as any)).toEqual(expected);
  });
});

describe('convertYield', () => {
  const cases = [
    {
      name: 'formats amount and unit',
      input: { amount: 2, unit: 'loaves' },
      expected: '2 loaves'
    },
    {
      name: 'formats when only amount present',
      input: { amount: 12, unit: '' },
      expected: '12'
    },
    {
      name: 'returns undefined without yield',
      input: undefined,
      expected: undefined
    },
    {
      name: 'returns undefined when missing amount and unit',
      input: { amount: undefined, unit: undefined },
      expected: undefined
    },
    {
      name: 'trims trailing spaces',
      input: { amount: 3, unit: 'dozen ' },
      expected: '3 dozen'
    }
  ] as const;

  it.each(cases)('%s', ({ input, expected }) => {
    expect(convertYield(input as any)).toBe(expected);
  });
});

describe('convertAuthor', () => {
  const cases = [
    {
      name: 'creates Person author',
      input: { author: 'Chef A' },
      expected: { author: { '@type': 'Person', name: 'Chef A' } }
    },
    {
      name: 'creates Organization publisher',
      input: { name: 'Kitchen' },
      expected: { publisher: { '@type': 'Organization', name: 'Kitchen' } }
    },
    {
      name: 'includes both author and publisher',
      input: { author: 'Chef', name: 'Kitchen' },
      expected: {
        author: { '@type': 'Person', name: 'Chef' },
        publisher: { '@type': 'Organization', name: 'Kitchen' }
      }
    },
    {
      name: 'maps URL',
      input: { url: 'https://recipe.test' },
      expected: { url: 'https://recipe.test' }
    },
    {
      name: 'returns empty object when source undefined',
      input: undefined,
      expected: {}
    },
    {
      name: 'ignores blank author names',
      input: { author: '', name: 'Kitchen' },
      expected: { publisher: { '@type': 'Organization', name: 'Kitchen' } }
    }
  ] as const;

  it.each(cases)('%s', ({ input, expected }) => {
    expect(convertAuthor(input as any)).toEqual(expected);
  });
});

describe('convertCategoryTags', () => {
  const cases = [
    {
      name: 'maps both category and tags',
      input: { category: 'Dessert', tags: ['Sweet', 'Holiday'] },
      expected: { recipeCategory: 'Dessert', keywords: 'Sweet, Holiday' }
    },
    {
      name: 'handles missing tags',
      input: { category: 'Breakfast', tags: undefined },
      expected: { recipeCategory: 'Breakfast' }
    },
    {
      name: 'filters empty tags',
      input: { category: undefined, tags: ['Vegan', '', 'Quick'] },
      expected: { keywords: 'Vegan, Quick' }
    },
    {
      name: 'returns empty object when nothing provided',
      input: { category: undefined, tags: undefined },
      expected: {}
    }
  ] as const;

  it.each(cases)('%s', ({ input, expected }) => {
    expect(convertCategoryTags(input.category as any, input.tags as any)).toEqual(expected);
  });
});

describe('convertNutrition', () => {
  const cases = [
    {
      name: 'returns undefined when nutrition absent',
      input: undefined,
      expected: undefined
    },
    {
      name: 'adds NutritionInformation type',
      input: { calories: '250 cal' },
      expected: { calories: '250 cal', '@type': 'NutritionInformation' }
    },
    {
      name: 'overrides custom @type values',
      input: { '@type': 'Custom', fatContent: '10g' },
      expected: { '@type': 'NutritionInformation', fatContent: '10g' }
    }
  ] as const;

  it.each(cases)('%s', ({ input, expected }) => {
    expect(convertNutrition(input as any)).toEqual(expected as any);
  });
});

describe('cleanOutput', () => {
  it('removes undefined values but keeps null', () => {
    const result = cleanOutput({
      defined: 'value',
      missing: undefined,
      nullable: null
    });
    expect(result).toEqual({ defined: 'value', nullable: null });
    expect(result).not.toHaveProperty('missing');
  });
});

describe('toSchemaOrg integration', () => {
  it('assembles full recipe payload', () => {
    const recipe = buildRecipe({
      ingredients: [
        '2 cups flour',
        { item: '1 cup sugar' },
        { subsection: 'Frosting', items: [{ item: '1/2 cup butter' }] } as any
      ],
      instructions: [
        'Preheat oven',
        { subsection: 'Bake', items: ['Pour batter', { text: 'Bake 30 minutes' }] } as any
      ],
      tags: ['Dessert', 'Chocolate'],
      time: { prep: 20, active: 30, total: 60 },
      yield: { amount: 24, unit: 'cookies' }
    });

    const schema = toSchemaOrg(recipe);

    expect(schema).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: recipe.name,
      recipeYield: '24 cookies',
      recipeIngredient: ['2 cups flour', '1 cup sugar', '1/2 cup butter'],
      keywords: 'Dessert, Chocolate',
      prepTime: 'PT20M',
      cookTime: 'PT30M',
      totalTime: 'PT1H',
      nutrition: { '@type': 'NutritionInformation', calories: '200 cal' }
    });
  });

  it('creates structured instructions with sections', () => {
    const recipe = buildRecipe({
      instructions: [
        { subsection: 'Prep', items: ['Measure ingredients'] } as any,
        { text: 'Bake' }
      ]
    });

    const schema = toSchemaOrg(recipe);
    const sections = schema.recipeInstructions as Array<HowToStep | HowToSection>;

    expect(sections[0]).toMatchObject({
      '@type': 'HowToSection',
      name: 'Prep'
    });
    expect(sections[1]).toEqual(step('Bake'));
  });

  it('removes undefined optional fields', () => {
    const recipe = buildRecipe({
      description: undefined,
      image: undefined,
      tags: undefined,
      source: undefined,
      time: undefined,
      yield: undefined,
      nutrition: undefined
    });

    const schema = toSchemaOrg(recipe);
    expect(schema).not.toHaveProperty('description');
    expect(schema).not.toHaveProperty('keywords');
    expect(schema).not.toHaveProperty('prepTime');
    expect(schema).not.toHaveProperty('recipeYield');
    expect(schema).not.toHaveProperty('nutrition');
  });
});

describe('round-trip conversion', () => {
  it('preserves key recipe data', () => {
    const recipe = buildRecipe({
      image: ['https://example.com/hero.jpg', 'https://example.com/gallery.jpg'],
      ingredients: [
        { item: '2 cups flour', name: 'flour' },
        { subsection: 'Frosting', items: ['1 cup sugar'] } as any
      ],
      instructions: [
        'Mix dry ingredients',
        { subsection: 'Finish', items: ['Frost cake'] } as any,
        { text: 'Serve', image: 'https://example.com/step.jpg' }
      ],
      tags: ['Dessert', 'Party']
    });

    const schema = toSchemaOrg(recipe);
    const roundTrip = fromSchemaOrg(schema as SchemaOrgRecipe);

    expect(roundTrip).not.toBeNull();
    expect(roundTrip?.name).toBe(recipe.name);
    expect(roundTrip?.category).toBe(recipe.category);
    expect(roundTrip?.tags).toEqual(expect.arrayContaining(['Dessert', 'Party']));
    expect(roundTrip?.ingredients.length).toBeGreaterThanOrEqual(2);
    expect(roundTrip?.instructions.length).toBe(3);
    expect(roundTrip?.time).toMatchObject(recipe.time!);
    expect(roundTrip?.image).toEqual(recipe.image);
    expect(roundTrip?.instructions[2]).toEqual({
      text: 'Serve',
      image: 'https://example.com/step.jpg'
    });
  });
});
