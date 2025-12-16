export type UnitDimension = 'mass' | 'volume';

export type MassUnit = 'g' | 'kg' | 'oz' | 'lb';
export type VolumeUnit =
  | 'ml'
  | 'l'
  | 'tsp'
  | 'tbsp'
  | 'fl_oz'
  | 'cup'
  | 'pint'
  | 'quart'
  | 'gallon';

export type Unit = MassUnit | VolumeUnit;

export type MetricMassUnit = 'g' | 'kg';
export type MetricVolumeUnit = 'ml' | 'l';
export type MetricUnit = MetricMassUnit | MetricVolumeUnit;

export interface UnitDefinition {
  dimension: UnitDimension;
  /**
   * Multiplier that converts from the unit into metric base units (g or ml).
   */
  toMetricBase: number;
  metricBaseUnit: MetricMassUnit | MetricVolumeUnit;
  isMetric: boolean;
}

const MASS_UNITS: Record<MassUnit, UnitDefinition> = {
  g: {
    dimension: 'mass',
    toMetricBase: 1,
    metricBaseUnit: 'g',
    isMetric: true
  },
  kg: {
    dimension: 'mass',
    toMetricBase: 1000,
    metricBaseUnit: 'g',
    isMetric: true
  },
  oz: {
    dimension: 'mass',
    toMetricBase: 28.349523125,
    metricBaseUnit: 'g',
    isMetric: false
  },
  lb: {
    dimension: 'mass',
    toMetricBase: 453.59237,
    metricBaseUnit: 'g',
    isMetric: false
  }
};

const VOLUME_UNITS: Record<VolumeUnit, UnitDefinition> = {
  ml: {
    dimension: 'volume',
    toMetricBase: 1,
    metricBaseUnit: 'ml',
    isMetric: true
  },
  l: {
    dimension: 'volume',
    toMetricBase: 1000,
    metricBaseUnit: 'ml',
    isMetric: true
  },
  tsp: {
    dimension: 'volume',
    toMetricBase: 4.92892159375,
    metricBaseUnit: 'ml',
    isMetric: false
  },
  tbsp: {
    dimension: 'volume',
    toMetricBase: 14.78676478125,
    metricBaseUnit: 'ml',
    isMetric: false
  },
  fl_oz: {
    dimension: 'volume',
    toMetricBase: 29.5735295625,
    metricBaseUnit: 'ml',
    isMetric: false
  },
  cup: {
    dimension: 'volume',
    toMetricBase: 236.5882365,
    metricBaseUnit: 'ml',
    isMetric: false
  },
  pint: {
    dimension: 'volume',
    toMetricBase: 473.176473,
    metricBaseUnit: 'ml',
    isMetric: false
  },
  quart: {
    dimension: 'volume',
    toMetricBase: 946.352946,
    metricBaseUnit: 'ml',
    isMetric: false
  },
  gallon: {
    dimension: 'volume',
    toMetricBase: 3785.411784,
    metricBaseUnit: 'ml',
    isMetric: false
  }
};

export const UNIT_DEFINITIONS: Record<Unit, UnitDefinition> = {
  ...MASS_UNITS,
  ...VOLUME_UNITS
};

export type NormalizedUnit = keyof typeof UNIT_DEFINITIONS;

export function normalizeUnitToken(
  unit?: string | null
): NormalizedUnit | null {
  if (!unit) {
    return null;
  }

  const token = unit.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return (token as NormalizedUnit) in UNIT_DEFINITIONS
    ? (token as NormalizedUnit)
    : null;
}

export function convertToMetricBase(
  quantity: number,
  unit: Unit
): {
  quantity: number;
  baseUnit: MetricUnit;
  definition: UnitDefinition;
} {
  const definition = UNIT_DEFINITIONS[unit];
  const quantityInMetricBase = quantity * definition.toMetricBase;
  return {
    quantity: quantityInMetricBase,
    baseUnit: definition.metricBaseUnit,
    definition
  };
}
