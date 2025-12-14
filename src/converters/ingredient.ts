import { Ingredient, Quantity } from '../types';

const UNICODE_FRACTIONS: Record<string, string> = {
  '½': '1/2',
  '⅓': '1/3',
  '⅔': '2/3',
  '¼': '1/4',
  '¾': '3/4',
  '⅕': '1/5',
  '⅖': '2/5',
  '⅗': '3/5',
  '⅘': '4/5',
  '⅙': '1/6',
  '⅚': '5/6',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8'
};

const PREP_KEYWORDS = [
  'diced',
  'minced',
  'chopped',
  'softened',
  'split',
  'cubed',
  'sifted',
  'room temperature',
  'at room temperature',
  'softened',
  'melted',
  'divided',
  'crumbled'
];

const MEASUREMENT_UNITS: Record<string, string> = {
  cup: 'cup',
  cups: 'cup',
  c: 'cup',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  gram: 'g',
  grams: 'g',
  g: 'g',
  kilogram: 'kg',
  kilograms: 'kg',
  kg: 'kg',
  milliliter: 'ml',
  milliliters: 'ml',
  ml: 'ml',
  liter: 'l',
  liters: 'l',
  l: 'l',
  ounce: 'oz',
  ounces: 'oz',
  oz: 'oz',
  pound: 'lb',
  pounds: 'lb',
  lb: 'lb',
  lbs: 'lb',
  pinch: 'pinch',
  pinches: 'pinch',
  dash: 'dash',
  dashes: 'dash'
};

const WEIGHT_PRIORITY_UNITS = new Set(['g', 'kg', 'oz', 'lb']);

interface ParentheticalExtraction {
  measurement?: Quantity;
  notes: string[];
  cleaned: string;
}

interface RangeExtraction {
  amount: number;
  unit: string | null;
  notes: string[];
  cleaned: string;
}

export function parseIngredientLine(line: string): Ingredient {
  const original = line.trim();
  if (!original) {
    return {
      item: '',
      name: '',
      scaling: { type: 'linear' }
    };
  }

  let working = normalizeFractions(original);
  let optional = false;
  const notes: string[] = [];
  let prep: string | undefined;

  // Optional markers
  if (/\(optional\)/i.test(working) || /\boptional\b/i.test(working)) {
    optional = true;
    working = working.replace(/\(?optional\)?/gi, '').trim();
  }

  // Extract parenthetical notes/measurements
  const parenthetical = extractParentheticals(working);
  working = parenthetical.cleaned.trim();
  notes.push(...parenthetical.notes);

  // Handle "to taste" style notes before we remove commas
  if (/to taste/i.test(working)) {
    notes.push('to taste');
    working = working.replace(/to taste/gi, '').trim();
  }

  // Split prep descriptors separated by commas
  const commaParts = working.split(',');
  working = commaParts.shift()!.trim();
  const trailing = commaParts.join(',').trim();
  if (trailing) {
    if (isPrepPhrase(trailing)) {
      prep = trailing;
    } else {
      notes.push(trailing);
    }
  }

  // Extract any ranges (e.g., 2-3 cups)
  let quantity: Quantity | undefined;
  const range = extractRange(working);
  if (range) {
    working = range.cleaned;
    notes.push(...range.notes);
    quantity = {
      amount: range.amount,
      unit: range.unit
    };
  }

  // Extract leading numeric amount (if not already defined via range)
  if (!quantity) {
    const amountMatch = working.match(
      /^((?:\d+\s+)?\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)/i
    );
    if (amountMatch) {
      const amountValue = parseNumeric(amountMatch[0]);
      working = working.slice(amountMatch[0].length).trim();
      if (typeof amountValue === 'number') {
        quantity = { amount: amountValue, unit: null };
      }
    }
  }

  // Extract unit if present and recognized
  if (quantity) {
    const unitMatch = working.match(/^([a-zA-Z]+)\b/);
    if (unitMatch) {
      const rawUnit = unitMatch[1].toLowerCase();
      const canonical = MEASUREMENT_UNITS[rawUnit];
      if (canonical) {
        quantity.unit = canonical;
        working = working.slice(unitMatch[0].length).trim();
      }
    }
  }

  // Prefer parenthetical measurement if it contains weight info
  if (parenthetical.measurement) {
    const parentheticalUnit = parenthetical.measurement.unit;
    if (
      parentheticalUnit &&
      (!quantity ||
        !quantity.unit ||
        WEIGHT_PRIORITY_UNITS.has(parentheticalUnit))
    ) {
      quantity = parenthetical.measurement;
    }
  }

  let name = cleanIngredientName(working);
  const forMatch = name.match(/^(.*?)(?:\s+for\s+(.*))$/i);
  if (forMatch) {
    name = forMatch[1].trim();
    const reason = forMatch[2]?.trim();
    if (reason) {
      notes.push(`for ${reason}`);
    }
  }

  // If we never found a numeric quantity, keep quantity undefined
  if (quantity && Number.isNaN(quantity.amount)) {
    quantity = undefined;
  }

  // Merge duplicate notes and clean whitespace
  const cleanedNotes = Array.from(
    new Set(notes.map(n => n.trim()).filter(Boolean))
  );

  const ingredient: Ingredient = {
    item: original,
    scaling: { type: 'linear' },
    ...(name ? { name } : {}),
    ...(quantity ? { quantity } : {}),
    ...(prep ? { prep } : {}),
    ...(cleanedNotes.length ? { notes: cleanedNotes.join('; ') } : {}),
    ...(optional ? { optional: true } : {})
  };

  return ingredient;
}

function normalizeFractions(input: string): string {
  return input.replace(
    /[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g,
    match => UNICODE_FRACTIONS[match] || match
  );
}

function parseNumeric(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d+\s+\d+\/\d+$/.test(trimmed)) {
    const [whole, fraction] = trimmed.split(/\s+/);
    return parseInt(whole, 10) + parseFraction(fraction);
  }

  if (/^\d+\/\d+$/.test(trimmed)) {
    return parseFraction(trimmed);
  }

  const parsed = parseFloat(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseFraction(value: string): number {
  const [numerator, denominator] = value.split('/').map(Number);
  if (!denominator) return numerator;
  return numerator / denominator;
}

function extractParentheticals(text: string): ParentheticalExtraction {
  const notes: string[] = [];
  let measurement: Quantity | undefined;
  const cleaned = text.replace(/\(([^)]+)\)/g, (_match, group) => {
    const parsed = parseMeasurement(group);
    if (parsed && !measurement) {
      measurement = parsed;
      return '';
    }
    notes.push(group.trim());
    return '';
  });

  return { measurement, notes, cleaned };
}

function parseMeasurement(raw: string): Quantity | undefined {
  const match = raw
    .trim()
    .match(/^((?:\d+\s+)?\d+\/\d+|\d+(?:\.\d+)?)(?:\s*)([a-zA-Z]+)?$/);
  if (!match) return undefined;

  const amount = parseNumeric(match[1]);
  if (amount === null) return undefined;

  const unit = match[2] ? MEASUREMENT_UNITS[match[2].toLowerCase()] : null;

  return {
    amount,
    unit: unit ?? null
  };
}

function extractRange(text: string): RangeExtraction | undefined {
  const match = text.match(
    /^((?:\d+\s+)?\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*-\s*((?:\d+\s+)?\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?:\s+([a-zA-Z]+))?/
  );

  if (!match) return undefined;

  const low = parseNumeric(match[1]);
  const unitRaw = match[3] ? match[3].toLowerCase() : undefined;
  const unit =
    unitRaw && MEASUREMENT_UNITS[unitRaw] ? MEASUREMENT_UNITS[unitRaw] : null;

  const cleaned = text.slice(match[0].length).trim();

  return {
    amount: low ?? 0,
    unit,
    notes: [match[0].trim()],
    cleaned
  };
}

function cleanIngredientName(raw: string): string {
  if (!raw) {
    return '';
  }

  let result = raw.trim();
  result = result.replace(/^of\s+/i, '').trim();

  if (/^can\b/i.test(result)) {
    result = result.replace(/^can\b/i, 'canned').trim();
  }

  return result;
}

function isPrepPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return PREP_KEYWORDS.some(keyword => lower.includes(keyword));
}
