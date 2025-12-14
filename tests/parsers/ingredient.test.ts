import {
  normalizeIngredientInput,
  parseIngredient,
  parseIngredients
} from '../../src/parsers/ingredient';

const fixtures = [
  '2 cups all-purpose flour',
  '1 cup sugar',
  '1/2 teaspoon salt',
  '2 1/4 cups flour',
  '1/3 cup vegetable oil',
  '3/4 cup packed brown sugar',
  '3 large eggs',
  '2 cloves garlic, minced',
  '1 medium onion, diced',
  '1 cup butter, softened',
  '1 cup (225g) butter, softened',
  '2 cups flour, sifted',
  '1 lb chicken breast, cut into cubes',
  '1 cup (2 sticks) butter',
  '1 (14.5 oz) can diced tomatoes',
  '2 cups (500ml) chicken broth',
  '1/4 cup walnuts, chopped (optional)',
  'Fresh parsley for garnish (optional)',
  'Salt and pepper to taste',
  'A pinch of cayenne',
  'Olive oil for drizzling',
  '2-3 tablespoons fresh lemon juice (from 1 lemon)',
  'One 9-inch refrigerated pie crust',
  '4 bone-in, skin-on chicken thighs (about 2 lbs)'
];

describe('normalizeIngredientInput', () => {
  const cases: Array<[string, string]> = [
    ['  2 cups flour  ', '2 cups flour'],
    ['\u00BD cup sugar', '0.5 cup sugar'],
    ['1\u00BD cups butter', '1.5 cups butter'],
    ['2\u20133 cloves garlic', '2-3 cloves garlic'],
    ['Two tablespoons oil', '2 tablespoons oil'],
    ['One 9-inch pie crust', '1 9-inch pie crust'],
    ['1\u2153 cup stock', '1.333 cup stock'],
    ['3\u215D cups milk', '3.625 cups milk'],
    ['2\u00A0cups flour', '2 cups flour'],
    ['1\u20142 tsp salt', '1-2 tsp salt'],
    ['\u00BE cup chopped nuts', '0.75 cup chopped nuts'],
    ['1\u00BC cups sugar', '1.25 cups sugar']
  ];

  test.each(cases)('normalizes "%s"', (input, expected) => {
    expect(normalizeIngredientInput(input)).toBe(expected);
  });
});

describe('parseIngredient quantity parsing', () => {
  const quantityCases = [
    {
      input: '2 cups all-purpose flour',
      quantity: { amount: 2, unit: 'cup' },
      name: 'all-purpose flour'
    },
    {
      input: '1/2 tsp salt',
      quantity: { amount: 0.5, unit: 'tsp' },
      name: 'salt'
    },
    {
      input: '2 1/4 cups sugar',
      quantity: { amount: 2.25, unit: 'cup' },
      name: 'sugar'
    },
    {
      input: '3 large eggs',
      quantity: { amount: 3, unit: null },
      name: 'large eggs'
    },
    {
      input: '1 cup (225g) butter',
      quantity: { amount: 225, unit: 'g' },
      name: 'butter'
    },
    {
      input: '2 (14oz) cans diced tomatoes',
      quantity: { amount: 14, unit: 'oz' },
      name: 'canned diced tomatoes',
      notes: '2 cans'
    },
    {
      input: '2-3 cloves garlic, minced',
      quantity: { amount: 2, unit: null },
      name: 'garlic',
      prep: 'minced',
      notes: '2-3 cloves'
    },
    {
      input: 'Salt and pepper to taste',
      quantity: { amount: null, unit: null },
      name: 'Salt and pepper',
      notes: 'to taste'
    },
    {
      input: 'A pinch of cayenne',
      quantity: { amount: null, unit: null },
      name: 'cayenne',
      notes: 'a pinch'
    },
    {
      input: 'Few sprigs of thyme',
      quantity: { amount: null, unit: null },
      name: 'thyme',
      notes: 'few sprigs'
    },
    {
      input: 'Juice of 1 lemon',
      quantity: { amount: null, unit: null },
      name: 'lemon juice',
      notes: 'from 1 lemon'
    },
    {
      input: 'Olive oil for drizzling',
      quantity: { amount: null, unit: null },
      name: 'Olive oil',
      notes: 'for drizzling'
    },
    {
      input: 'Butter for greasing (optional)',
      quantity: { amount: null, unit: null },
      name: 'Butter',
      notes: 'for greasing',
      optional: true
    },
    {
      input: '2 cups (500ml) chicken broth',
      quantity: { amount: 500, unit: 'ml' },
      name: 'chicken broth'
    }
  ];

  test.each(quantityCases)('parses %s', ({ input, quantity, name, prep, notes, optional }) => {
    const result = parseIngredient(input);
    expect(result.quantity).toEqual(quantity);
    if (name) {
      expect(result.name).toBe(name);
    }
    if (prep) {
      expect(result.prep).toBe(prep);
    }
    if (notes) {
      expect(result.notes).toContain(notes);
    }
    if (optional) {
      expect(result.optional).toBe(true);
    }
  });
});

describe('parseIngredient name & prep extraction', () => {
  const cases = [
    {
      input: '2 cups all-purpose flour, sifted',
      name: 'all-purpose flour',
      prep: 'sifted'
    },
    {
      input: '1 cup butter, softened',
      name: 'butter',
      prep: 'softened'
    },
    {
      input: '1 lb chicken breast, cut into cubes',
      name: 'chicken breast',
      prep: 'cut into cubes'
    },
    {
      input: 'Fresh parsley for garnish',
      name: 'Fresh parsley',
      note: 'for garnish'
    },
    {
      input: '2 cloves garlic, finely minced',
      name: 'garlic',
      prep: 'finely minced'
    },
    {
      input: '1 cup walnuts, chopped (optional)',
      name: 'walnuts',
      prep: 'chopped',
      optional: true
    },
    {
      input: '1 (14oz) can tomatoes',
      name: 'canned tomatoes'
    },
    {
      input: '3 sprigs fresh thyme',
      name: 'fresh thyme'
    },
    {
      input: '1 cup (2 sticks) butter',
      name: 'butter'
    },
    {
      input: '2 cups flour, divided',
      name: 'flour',
      prep: 'divided'
    }
  ];

  test.each(cases)('extracts name/prep from %s', ({ input, name, prep, note, optional }) => {
    const result = parseIngredient(input);
    if (name) {
      expect(result.name).toBe(name);
    }
    if (prep) {
      expect(result.prep).toBe(prep);
    }
    if (note) {
      expect(result.notes).toContain(note);
    }
    if (optional) {
      expect(result.optional).toBe(true);
    }
  });
});

describe('parseIngredient edge cases', () => {
  const cases = [
    {
      input: '1 (14.5 oz) can diced tomatoes',
      quantity: { amount: 14.5, unit: 'oz' }
    },
    {
      input: 'One 9-inch pie crust',
      quantity: { amount: 1, unit: null },
      name: '9-inch pie crust'
    },
    {
      input: '4 bone-in, skin-on chicken thighs (about 2 lbs)',
      quantity: { amount: 2, unit: 'lb' },
      name: 'bone-in, skin-on chicken thighs'
    },
    {
      input: 'Some chopped parsley',
      quantity: { amount: null, unit: null },
      notes: 'some'
    },
    {
      input: 'Few sprigs of cilantro',
      quantity: { amount: null, unit: null },
      name: 'cilantro',
      notes: 'few sprigs'
    },
    {
      input: 'Zest of 2 limes',
      quantity: { amount: null, unit: null },
      name: 'lime zest',
      notes: 'from 2 limes'
    },
    {
      input: '1 cup (2 sticks) butter (optional)',
      optional: true
    },
    {
      input: '2 cloves garlic, divided',
      prep: 'divided'
    },
    {
      input: 'Olive oil as needed',
      notes: 'as needed'
    },
    {
      input: '1 tablespoon cumin seeds, toasted',
      prep: 'toasted'
    }
  ];

  test.each(cases)('handles %s', ({ input, quantity, name, notes, prep, optional }) => {
    const result = parseIngredient(input);
    if (quantity) {
      expect(result.quantity).toEqual(quantity);
    }
    if (name) {
      expect(result.name).toBe(name);
    }
    if (notes) {
      expect(result.notes).toContain(notes);
    }
    if (prep) {
      expect(result.prep).toBe(prep);
    }
    if (optional) {
      expect(result.optional).toBe(true);
    }
  });
});

describe('scaling inference', () => {
  const cases = [
    { input: '3 large eggs', type: 'discrete' },
    { input: '2 cloves garlic', type: 'discrete' },
    { input: '1 tsp salt', type: 'proportional' },
    { input: '1 tbsp paprika', type: 'proportional' },
    { input: 'Olive oil for greasing', type: 'fixed' },
    { input: 'Butter for greasing', type: 'fixed' },
    { input: '2 cups flour', type: 'linear' },
    { input: '1 tsp garlic powder', type: 'proportional' },
    { input: 'Salt and pepper to taste', type: 'proportional' },
    { input: '1 cup milk', type: 'linear' }
  ];

  test.each(cases)('infers scaling for %s', ({ input, type }) => {
    const result = parseIngredient(input);
    expect(result.scaling?.type).toBe(type);
  });
});

describe('parseIngredients fixtures', () => {
  test.each(fixtures)('parses "%s" without errors', input => {
    const result = parseIngredient(input);
    expect(result.item).toBe(input);
    expect(result.scaling?.type).toBeDefined();
  });

  it('bulk parses arrays of ingredients', () => {
    const parsed = parseIngredients(['2 cups flour', 'Salt and pepper to taste']);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe('flour');
    expect(parsed[1].notes).toContain('to taste');
  });
});
