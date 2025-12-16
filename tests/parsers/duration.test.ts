import {
  formatDuration,
  parseDuration,
  parseHumanDuration,
  smartParseDuration
} from '../../src/parsers/duration';

describe('parseDuration', () => {
  test.each([
    ['PT30M', 30],
    ['PT1H', 60],
    ['PT1H30M', 90],
    ['PT2H15M', 135],
    ['PT45S', 1],
    ['PT30S', 1],
    ['PT75S', 2],
    ['P1D', 1440],
    ['P1DT2H', 1560],
    ['P2DT3H30M', 3090],
    ['PT0M', 0],
    ['P0D', 0],
    ['pt15m', 15],
    ['PT1.5H', 90],
    ['PT90M', 90],
    [45, 45]
  ])('converts %s to %i minutes', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  test.each(['', '30 minutes', '1 hour', 'invalid', 'P', 'T30M', null, undefined])(
    'returns null for invalid ISO duration "%s"',
    value => {
      expect(parseDuration(value as any)).toBeNull();
    }
  );
});

describe('formatDuration', () => {
  test.each([
    [0, 'PT0M'],
    [30, 'PT30M'],
    [59, 'PT59M'],
    [60, 'PT1H'],
    [61, 'PT1H1M'],
    [90, 'PT1H30M'],
    [120, 'PT2H'],
    [135, 'PT2H15M'],
    [1440, 'P1D'],
    [1500, 'P1DT1H'],
    [1530, 'P1DT1H30M'],
    [2880, 'P2D'],
    [4320, 'P3D'],
    [-5, 'PT0M'],
    [null, 'PT0M']
  ])('formats %s minutes into %s', (minutes, expected) => {
    expect(formatDuration(minutes as any)).toBe(expected);
  });
});

describe('parseHumanDuration', () => {
  test.each([
    ['30 minutes', 30],
    ['30 mins', 30],
    ['30 min', 30],
    ['30 m', 30],
    ['1 hour', 60],
    ['1 hr', 60],
    ['1 h', 60],
    ['2 hours', 120],
    ['1 hour 30 minutes', 90],
    ['1h 30m', 90],
    ['1 hour, 45 minutes', 105],
    ['1.5 hours', 90],
    ['90 mins', 90],
    ['15 m', 15],
    ['overnight', 480],
    ['24 hours', 1440]
  ])('parses "%s" into %i minutes', (input, expected) => {
    expect(parseHumanDuration(input)).toBe(expected);
  });

  test.each(['', 'unknown', 'soon', 'a while', null, undefined])(
    'returns null for invalid human duration "%s"',
    value => {
      expect(parseHumanDuration(value as any)).toBeNull();
    }
  );
});

describe('smartParseDuration', () => {
  test.each([
    ['PT30M', 30],
    ['PT1H30M', 90],
    ['PT45S', 1],
    ['30 minutes', 30],
    ['1 hour 30 minutes', 90],
    ['overnight', 480],
    ['24 hours', 1440]
  ])('parses "%s" as %i minutes', (input, expected) => {
    expect(smartParseDuration(input)).toBe(expected);
  });

  test.each(['', 'invalid', null, undefined])(
    'returns null when unable to parse "%s"',
    value => {
      expect(smartParseDuration(value as any)).toBeNull();
    }
  );
});
