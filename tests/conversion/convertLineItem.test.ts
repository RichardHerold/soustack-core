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
        { ingredient: 'salt', quantity: 1, unit: 'pinch' },
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
});
