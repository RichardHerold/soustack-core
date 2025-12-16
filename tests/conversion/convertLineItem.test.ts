import {
  convertLineItemToMetric,
  MissingEquivalencyError,
  UnknownUnitError
} from '../../src/conversion/convertLineItem';

describe('convertLineItemToMetric', () => {
  const flourCups = {
    ingredient: 'flour',
    quantity: 2,
    unit: 'cup'
  };

  it('converts imperial volume to metric volume', () => {
    const converted = convertLineItemToMetric(flourCups, 'volume');

    expect(converted.unit).toBe('ml');
    expect(converted.quantity).toBe(473);
  });

  it('converts imperial volume to metric mass with equivalency notes', () => {
    const converted = convertLineItemToMetric(flourCups, 'mass');

    expect(converted.unit).toBe('g');
    expect(converted.quantity).toBe(240);
    expect(converted.notes).toContain('120g per cup');
  });

  it('throws UnknownUnitError for unsupported unit tokens', () => {
    expect(() =>
      convertLineItemToMetric(
        { ingredient: 'salt', quantity: 1, unit: 'handful' },
        'volume'
      )
    ).toThrow(UnknownUnitError);
  });

  it('throws MissingEquivalencyError when no volume→mass lookup exists', () => {
    expect(() =>
      convertLineItemToMetric(
        { ingredient: 'sugar', quantity: 1, unit: 'cup' },
        'mass'
      )
    ).toThrow(MissingEquivalencyError);
  });

  it('returns items with null units unchanged', () => {
    const onion = { ingredient: 'onion', quantity: 1, unit: null };

    expect(convertLineItemToMetric(onion, 'volume')).toEqual(onion);
    expect(convertLineItemToMetric(onion, 'mass')).toEqual(onion);
  });

  it('returns count-based units unchanged', () => {
    const pinch = { ingredient: 'sugar', quantity: 1, unit: 'pinch' };
    const clove = { ingredient: 'garlic', quantity: 2, unit: 'clove' };

    expect(convertLineItemToMetric(pinch, 'volume')).toEqual(pinch);
    expect(convertLineItemToMetric(pinch, 'mass')).toEqual(pinch);
    expect(convertLineItemToMetric(clove, 'volume')).toEqual(clove);
    expect(convertLineItemToMetric(clove, 'mass')).toEqual(clove);
  });
});
