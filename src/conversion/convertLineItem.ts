import {
  MetricMassUnit,
  MetricVolumeUnit,
  NormalizedUnit,
  convertToMetricBase,
  normalizeUnitToken,
  UNIT_DEFINITIONS
} from './units';

export type ConvertTarget = 'metric';
export type ConvertMode = 'volume' | 'mass';
export type RoundMode = 'none' | 'sane';

export interface LineItem {
  ingredient: string;
  quantity: number;
  unit: string | null;
}

export interface ConvertedLineItem extends LineItem {
  notes?: string;
}

export class UnknownUnitError extends Error {
  constructor(public readonly unit: string) {
    super(`Unknown unit "${unit}".`);
    this.name = 'UnknownUnitError';
  }
}

export class UnsupportedConversionError extends Error {
  constructor(
    public readonly unit: string,
    public readonly mode: ConvertMode
  ) {
    super(`Cannot convert unit "${unit}" in ${mode} mode.`);
    this.name = 'UnsupportedConversionError';
  }
}

export class MissingEquivalencyError extends Error {
  constructor(
    public readonly ingredient: string,
    public readonly unit: string
  ) {
    super(
      `No volume to mass equivalency for "${ingredient}" (${unit}).`
    );
    this.name = 'MissingEquivalencyError';
  }
}

type EquivalencyMap = Record<
  string,
  Partial<Record<NormalizedUnit, number>>
>;

const VOLUME_TO_MASS_EQUIV_G_PER_UNIT: EquivalencyMap = {
  flour: {
    cup: 120
  }
};

const DEFAULT_ROUND_MODE: RoundMode = 'sane';

export function convertLineItemToMetric(
  item: LineItem,
  mode: ConvertMode,
  opts?: { round?: RoundMode }
): ConvertedLineItem {
  const roundMode = opts?.round ?? DEFAULT_ROUND_MODE;
  const normalizedUnit = normalizeUnitToken(item.unit);

  if (!normalizedUnit) {
    if (!item.unit || item.unit.trim() === '') {
      return item;
    }

    throw new UnknownUnitError(item.unit);
  }

  const definition = UNIT_DEFINITIONS[normalizedUnit];

  if (definition.dimension === 'count') {
    return item;
  }

  if (mode === 'volume') {
    if (definition.dimension !== 'volume') {
      throw new UnsupportedConversionError(item.unit ?? '', mode);
    }

    const { quantity, unit } = finalizeMetricVolume(
      convertToMetricBase(item.quantity, normalizedUnit).quantity,
      roundMode
    );

    return {
      ...item,
      quantity,
      unit
    };
  }

  // mode === 'mass'
  if (definition.dimension === 'mass') {
    const { quantity, unit } = finalizeMetricMass(
      convertToMetricBase(item.quantity, normalizedUnit).quantity,
      roundMode
    );

    return {
      ...item,
      quantity,
      unit
    };
  }

  if (definition.dimension !== 'volume') {
    throw new UnsupportedConversionError(item.unit ?? '', mode);
  }

  const gramsPerUnit = lookupEquivalency(
    item.ingredient,
    normalizedUnit
  );

  if (!gramsPerUnit) {
    throw new MissingEquivalencyError(item.ingredient, item.unit ?? '');
  }

  const grams = item.quantity * gramsPerUnit;
  const massResult = finalizeMetricMass(grams, roundMode);

  return {
    ...item,
    quantity: massResult.quantity,
    unit: massResult.unit,
    notes: `Converted using ${gramsPerUnit}g per ${normalizedUnit} for ${item.ingredient}.`
  };
}

function finalizeMetricVolume(
  milliliters: number,
  roundMode: RoundMode
): { quantity: number; unit: MetricVolumeUnit } {
  if (roundMode === 'none') {
    return milliliters >= 1000
      ? { quantity: milliliters / 1000, unit: 'l' }
      : { quantity: milliliters, unit: 'ml' };
  }

  const roundedMl = roundMilliliters(milliliters);

  if (roundedMl >= 1000) {
    const liters = roundedMl / 1000;
    return {
      quantity: roundLargeMetric(liters),
      unit: 'l'
    };
  }

  return { quantity: roundedMl, unit: 'ml' };
}

function finalizeMetricMass(
  grams: number,
  roundMode: RoundMode
): { quantity: number; unit: MetricMassUnit } {
  if (roundMode === 'none') {
    return grams >= 1000
      ? { quantity: grams / 1000, unit: 'kg' }
      : { quantity: grams, unit: 'g' };
  }

  const roundedGrams = roundGrams(grams);

  if (roundedGrams >= 1000) {
    const kilograms = roundedGrams / 1000;
    return {
      quantity: roundLargeMetric(kilograms),
      unit: 'kg'
    };
  }

  return { quantity: roundedGrams, unit: 'g' };
}

function roundGrams(value: number): number {
  if (value < 1000) {
    return Math.round(value);
  }

  return Math.round(value / 5) * 5;
}

function roundMilliliters(value: number): number {
  if (value < 1000) {
    return Math.round(value);
  }

  return Math.round(value / 10) * 10;
}

function roundLargeMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function lookupEquivalency(
  ingredient: string,
  unit: NormalizedUnit
): number | undefined {
  const key = ingredient.trim().toLowerCase();
  return VOLUME_TO_MASS_EQUIV_G_PER_UNIT[key]?.[unit];
}
