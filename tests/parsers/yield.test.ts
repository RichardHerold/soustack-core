import {
  normalizeYield,
  parseYield,
  formatYield
} from '../../src/parsers/yield';

type YieldExpectation = Record<string, unknown>;
type YieldCase = [string, YieldExpectation];

describe('normalizeYield', () => {
  const cases: Array<[any, string]> = [
    ['  24   cookies  ', '24 cookies'],
    ['Serves\u00A04', 'Serves 4'],
    ['10\u201312 muffins', '10-12 muffins'],
    ['Makes\t24  cookies', 'Makes 24 cookies'],
    [null as any, ''],
    ['', '']
  ];

  test.each(cases)('normalizes %p', (input, expected) => {
    expect(normalizeYield(input as string)).toBe(expected);
  });
});

describe('parseYield - serves patterns', () => {
  const cases: YieldCase[] = [
    ['Serves 4', { amount: 4, unit: 'servings', servings: 4 }],
    ['serves 8', { amount: 8, unit: 'servings', servings: 8 }],
    ['Serves 4-6', { amount: 4, unit: 'servings', servings: 4, description: 'Serves 4-6' }],
    ['Serves 4 to 6', { amount: 4, unit: 'servings', servings: 4, description: 'Serves 4 to 6' }],
    ['Serving: 4', { amount: 4, unit: 'servings', servings: 4 }],
    ['Servings: 6-8', { amount: 6, unit: 'servings', servings: 6, description: 'Servings: 6-8' }],
    ['Servings 10', { amount: 10, unit: 'servings', servings: 10 }],
    ['Makes 4 servings', { amount: 4, unit: 'servings', servings: 4 }],
    ['Makes 4-6 servings', { amount: 4, unit: 'servings', servings: 4, description: 'Makes 4-6 servings' }],
    ['4 servings', { amount: 4, unit: 'servings', servings: 4 }]
  ];

  test.each(cases)('parses "%s"', (input, expected) => {
    const result = parseYield(input);
    expect(result).toEqual(expected);
  });
});

describe('parseYield - count and unit', () => {
  const cases: YieldCase[] = [
    ['24 cookies', { amount: 24, unit: 'cookies' }],
    ['1 loaf', { amount: 1, unit: 'loaf' }],
    ['One 9-inch pie', { amount: 1, unit: '9-inch pie' }],
    ['Two 8-inch layers', { amount: 2, unit: '8-inch layers' }],
    ['6 portions', { amount: 6, unit: 'portions', servings: 6 }],
    ['4 servings', { amount: 4, unit: 'servings', servings: 4 }],
    ['Two dozen cupcakes', { amount: 24, unit: 'cupcakes' }],
    ['a dozen', { amount: 12, unit: 'cookies' }],
    ['half dozen biscuits', { amount: 6, unit: 'biscuits' }]
  ];

  test.each(cases)('parses "%s"', (input, expected) => {
    const result = parseYield(input);
    expect(result).toEqual(expected);
  });
});

describe('parseYield - range patterns', () => {
  const cases: YieldCase[] = [
    ['24-30 cookies', { amount: 24, unit: 'cookies', description: '24-30 cookies' }],
    ['6-8 portions', { amount: 6, unit: 'portions', servings: 6, description: '6-8 portions' }],
    ['4 to 6 servings', { amount: 4, unit: 'servings', servings: 4, description: '4 to 6 servings' }],
    ['10 - 12 cupcakes', { amount: 10, unit: 'cupcakes', description: '10 - 12 cupcakes' }]
  ];

  test.each(cases)('parses "%s"', (input, expected) => {
    const result = parseYield(input);
    expect(result).toEqual(expected);
  });
});

describe('parseYield - parenthetical servings', () => {
  const cases: YieldCase[] = [
    ['1 loaf (8 slices)', { amount: 1, unit: 'loaf', servings: 8, description: '1 loaf (8 slices)' }],
    ['1 cake (12 servings)', { amount: 1, unit: 'cake', servings: 12, description: '1 cake (12 servings)' }],
    ['2 pizzas (serves 8)', { amount: 2, unit: 'pizzas', servings: 8, description: '2 pizzas (serves 8)' }],
    ['1 9x13 pan (24 squares)', { amount: 1, unit: '9x13 pan', servings: 24, description: '1 9x13 pan (24 squares)' }],
    ['1 batch (about 36 cookies)', { amount: 1, unit: 'batch', servings: 36, description: '1 batch (about 36 cookies)' }]
  ];

  test.each(cases)('parses "%s"', (input, expected) => {
    const result = parseYield(input);
    expect(result).toEqual(expected);
  });
});

describe('parseYield - plain numbers', () => {
  const cases: YieldCase[] = [
    ['4', { amount: 4, unit: 'servings', servings: 4 }],
    ['6', { amount: 6, unit: 'servings', servings: 6 }],
    ['12', { amount: 12, unit: 'servings', servings: 12 }]
  ];

  test.each(cases)('parses "%s"', (input, expected) => {
    const result = parseYield(input);
    expect(result).toEqual(expected);
  });
});

describe('parseYield - makes/yields prefix', () => {
  const cases: YieldCase[] = [
    ['Makes 24 cookies', { amount: 24, unit: 'cookies' }],
    ['Makes 1 loaf', { amount: 1, unit: 'loaf' }],
    ['Makes about 3 dozen', { amount: 36, unit: 'cookies', description: 'Makes about 3 dozen' }],
    ['Yields 2 cups', { amount: 2, unit: 'cups' }],
    ['Yields 6 portions', { amount: 6, unit: 'portions', servings: 6 }],
    ['Makes 2 dozen cupcakes', { amount: 24, unit: 'cupcakes' }]
  ];

  test.each(cases)('parses "%s"', (input, expected) => {
    const result = parseYield(input);
    expect(result).toEqual(expected);
  });
});

describe('formatYield', () => {
  test('returns description when present', () => {
    expect(
      formatYield({
        amount: 4,
        unit: 'servings',
        servings: 4,
        description: 'Serves 4-6'
      })
    ).toBe('Serves 4-6');
  });

  test('formats serving units', () => {
    expect(formatYield({ amount: 4, unit: 'servings', servings: 4 })).toBe('Serves 4');
  });

  test('formats count + unit', () => {
    expect(formatYield({ amount: 24, unit: 'cookies' })).toBe('24 cookies');
  });

  test('appends servings for non-serving units', () => {
    expect(formatYield({ amount: 1, unit: 'loaf', servings: 8 })).toBe('1 loaf (8 servings)');
  });

  test('passes through pizzas without servings', () => {
    expect(formatYield({ amount: 2, unit: 'pizzas' })).toBe('2 pizzas');
  });

  test('formats portions with inferred servings', () => {
    expect(formatYield({ amount: 6, unit: 'portions', servings: 6 })).toBe('6 portions (6 servings)');
  });

  test('handles dozen description', () => {
    expect(
      formatYield({
        amount: 36,
        unit: 'cookies',
        description: 'Makes about 3 dozen'
      })
    ).toBe('Makes about 3 dozen');
  });

  test('handles cake with servings', () => {
    expect(formatYield({ amount: 1, unit: 'cake', servings: 12 })).toBe('1 cake (12 servings)');
  });
});
