import { ParsedIngredient, Scaling } from '../types';

type QuantityShape = { amount: number | null; unit: string | null };

interface QuantityExtraction {
  amount: number | null;
  unit: string | null;
  remainder: string;
  notes: string[];
  descriptor?: string;
  originalAmount: number | null;
}

interface ParentheticalExtraction {
  cleaned: string;
  measurement?: QuantityShape;
  notes: string[];
  optional: boolean;
}

interface VagueQuantityResult {
  remainder: string;
  note: string;
}

interface FlavorExtractionResult {
  cleaned: string;
  notes: string[];
}

interface PurposeExtractionResult {
  cleaned: string;
  notes: string[];
}

interface JuiceExtractionResult {
  cleaned: string;
  note: string;
}

const FRACTION_DECIMALS: Record<string, number> = {
  '½': 0.5,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 0.25,
  '¾': 0.75,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875
};

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  half: 0.5,
  quarter: 0.25
};

const UNIT_SYNONYMS: Record<string, string> = {
  cup: 'cup',
  cups: 'cup',
  c: 'cup',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tbs: 'tbsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  t: 'tsp',
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
  pint: 'pint',
  pints: 'pint',
  quart: 'quart',
  quarts: 'quart',
  stick: 'stick',
  sticks: 'stick',
  dash: 'dash',
  pinches: 'pinch',
  pinch: 'pinch'
};

const PREP_PHRASES = [
  'diced',
  'finely diced',
  'roughly diced',
  'minced',
  'finely minced',
  'chopped',
  'finely chopped',
  'roughly chopped',
  'sliced',
  'thinly sliced',
  'thickly sliced',
  'grated',
  'finely grated',
  'zested',
  'sifted',
  'softened',
  'at room temperature',
  'room temperature',
  'room temp',
  'melted',
  'toasted',
  'drained',
  'drained and rinsed',
  'beaten',
  'divided',
  'cut into cubes',
  'cut into pieces',
  'cut into strips',
  'cut into chunks',
  'cut into bite-size pieces'
].map(value => value.toLowerCase());

const COUNT_DESCRIPTORS = new Set([
  'clove',
  'cloves',
  'can',
  'cans',
  'stick',
  'sticks',
  'sprig',
  'sprigs',
  'bunch',
  'bunches',
  'slice',
  'slices',
  'package',
  'packages'
]);

const DESCRIPTOR_NOTE_SET = new Set(['can', 'cans', 'jar', 'jars', 'package', 'packages', 'bottle', 'bottles']);

const WEIGHT_PRIORITY_UNITS = new Set(['g', 'kg', 'oz', 'lb', 'ml', 'l']);

const SPICE_KEYWORDS = [
  'salt',
  'pepper',
  'paprika',
  'cumin',
  'coriander',
  'turmeric',
  'chili powder',
  'garlic powder',
  'onion powder',
  'cayenne',
  'cinnamon',
  'nutmeg',
  'allspice',
  'ginger',
  'oregano',
  'thyme',
  'rosemary',
  'basil',
  'sage',
  'clove',
  'spice',
  'seasoning'
];

const PURPOSE_KEYWORDS = ['frying', 'greasing', 'drizzling', 'garnish', 'serving', 'brushing'];

const RANGE_REGEX =
  /^((?:\d+\s+)?\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?:\s*(?:-|to)\s*((?:\d+\s+)?\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?))/i;
const NUMBER_REGEX = /^((?:\d+\s+)?\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)/i;

const QUALIFIER_REGEX = /^(about|around|approximately|approx\.?|roughly)\s+/i;

const FLAVOR_NOTE_REGEX = /\b(to taste|as needed|as necessary)\b/gi;

const VAGUE_QUANTITY_PATTERNS: { regex: RegExp; note: string }[] = [
  { regex: /^(a\s+pinch|pinch)\b/i, note: 'a pinch' },
  { regex: /^(a\s+handful|handful)\b/i, note: 'a handful' },
  { regex: /^(a\s+dash|dash)\b/i, note: 'a dash' },
  { regex: /^(a\s+sprinkle|sprinkle)\b/i, note: 'a sprinkle' },
  { regex: /^(some)\b/i, note: 'some' },
  { regex: /^(few\s+sprigs)/i, note: 'few sprigs' },
  { regex: /^(a\s+few|few)\b/i, note: 'a few' },
  { regex: /^(several)\b/i, note: 'several' }
];

const JUICE_PREFIXES = ['juice of', 'zest of'];

export function normalizeIngredientInput(input: string): string {
  if (!input) return '';
  let result = input.replace(/\u00A0/g, ' ').trim();
  result = replaceDashes(result);
  result = replaceUnicodeFractions(result);
  result = replaceNumberWords(result);
  result = result.replace(/\s+/g, ' ').trim();
  return result;
}

export function parseIngredient(text: string): ParsedIngredient {
  const original = text ?? '';
  const normalized = normalizeIngredientInput(original);
  if (!normalized) {
    return {
      name: original,
      scaling: { mode: 'linear' }
    };
  }

  let working = normalized;
  const notes: string[] = [];
  let optional = false;

  if (/\boptional\b/i.test(working)) {
    optional = true;
    working = working.replace(/\(?\s*optional\s*\)?/gi, '').trim();
    working = working.replace(/\(\s*\)/g, ' ').trim();
  }

  const flavorExtraction = extractFlavorNotes(working);
  working = flavorExtraction.cleaned;
  notes.push(...flavorExtraction.notes);

  const parenthetical = extractParentheticals(working);
  working = parenthetical.cleaned;
  notes.push(...parenthetical.notes);
  optional = optional || parenthetical.optional;

  const purposeExtraction = extractPurposeNotes(working);
  working = purposeExtraction.cleaned;
  notes.push(...purposeExtraction.notes);

  const juiceExtraction = extractJuicePhrase(working);
  if (juiceExtraction) {
    working = juiceExtraction.cleaned;
    notes.push(juiceExtraction.note);
  }

  const vagueQuantity = extractVagueQuantity(working);

  let quantityResult: QuantityExtraction;
  if (vagueQuantity) {
    notes.push(vagueQuantity.note);
    quantityResult = {
      amount: null,
      unit: null,
      descriptor: undefined,
      remainder: vagueQuantity.remainder,
      notes: [],
      originalAmount: null
    };
  } else {
    quantityResult = extractQuantity(working);
  }

  working = quantityResult.remainder;

  const { quantity, usedParenthetical } = mergeQuantities(quantityResult, parenthetical.measurement);
  if (
    usedParenthetical &&
    quantityResult.originalAmount !== null &&
    quantityResult.originalAmount > 1 &&
    quantityResult.descriptor &&
    DESCRIPTOR_NOTE_SET.has(quantityResult.descriptor.toLowerCase())
  ) {
    notes.push(formatCountNote(quantityResult.originalAmount, quantityResult.descriptor));
  }

  notes.push(...quantityResult.notes);

  working = working.replace(/^[,.\s-]+/, '').trim();
  working = working.replace(/^of\s+/i, '').trim();

  if (
    quantityResult.descriptor &&
    /^cans?$/i.test(quantityResult.descriptor) &&
    working &&
    !/^canned\b/i.test(working)
  ) {
    working = `canned ${working}`.trim();
  }

  const nameExtraction = extractNameAndPrep(working);
  notes.push(...nameExtraction.notes);

  const name = nameExtraction.name || undefined;

  const scaling = inferScaling(
    name,
    quantity.unit,
    quantity.amount,
    notes,
    quantityResult.descriptor
  );

  const mergedNotes = formatNotes(notes);

  const parsed: ParsedIngredient = {
    name: name || original,
    quantity,
    ...(nameExtraction.prep ? { prep: nameExtraction.prep } : {}),
    ...(optional ? { optional: true } : {}),
    scaling
  };

  if (mergedNotes) {
    parsed.notes = mergedNotes;
  }

  return parsed;
}

export function parseIngredientLine(text: string): ParsedIngredient {
  return parseIngredient(text);
}

export function parseIngredients(texts: string[]): ParsedIngredient[] {
  if (!Array.isArray(texts)) return [];
  return texts
    .map(item => (typeof item === 'string' ? item : String(item ?? '')))
    .map(entry => parseIngredient(entry));
}

function replaceDashes(value: string): string {
  return value.replace(/[\u2012\u2013\u2014\u2212]/g, '-');
}

function replaceUnicodeFractions(value: string): string {
  return value.replace(/(\d+)?(?:\s+)?([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, (_match, whole, fraction) => {
    const fractionValue = FRACTION_DECIMALS[fraction];
    if (fractionValue === undefined) return _match;
    const base = whole ? parseInt(whole, 10) : 0;
    const combined = base + fractionValue;
    return formatDecimal(combined);
  });
}

function replaceNumberWords(value: string): string {
  return value.replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|half|quarter)(?:-(one|two|three|four|five|six|seven|eight|nine))?\b/gi,
    (match, word, hyphenPart) => {
      const lower = word.toLowerCase();
      const baseValue = NUMBER_WORDS[lower];
      if (baseValue === undefined) return match;
      if (!hyphenPart) {
        return formatDecimal(baseValue);
      }
      const hyphenValue = NUMBER_WORDS[hyphenPart.toLowerCase()];
      if (hyphenValue === undefined) {
        return formatDecimal(baseValue);
      }
      return formatDecimal(baseValue + hyphenValue);
    }
  );
}

function formatDecimal(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return parseFloat(value.toFixed(3)).toString().replace(/\.0+$/, '');
}

function extractFlavorNotes(value: string): FlavorExtractionResult {
  const notes: string[] = [];
  const cleaned = value.replace(FLAVOR_NOTE_REGEX, (_, phrase) => {
    notes.push(phrase.toLowerCase());
    return '';
  });

  return {
    cleaned: cleaned.replace(/\s+/g, ' ').trim(),
    notes
  };
}

function extractPurposeNotes(value: string): PurposeExtractionResult {
  const notes: string[] = [];
  let working = value.trim();

  let match = working.match(/\bfor\s+(frying|greasing|drizzling|garnish|serving|brushing)\b\.?$/i);
  if (match) {
    notes.push(`for ${match[1].toLowerCase()}`);
    working = working.slice(0, match.index).trim();
  }

  return { cleaned: working, notes };
}

function extractJuicePhrase(value: string): JuiceExtractionResult | undefined {
  const lower = value.toLowerCase();
  for (const prefix of JUICE_PREFIXES) {
    if (lower.startsWith(prefix)) {
      const remainder = value.slice(prefix.length).trim();
      if (!remainder) break;
      const cleanedSource = remainder.replace(/^of\s+/i, '').trim();
      if (!cleanedSource) break;
      const sourceForName = cleanedSource
        .replace(
          /^(?:\d+(?:\.\d+)?|\d+\s+\d+\/\d+|\d+\/\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\s+/i,
          ''
        )
        .replace(/^(?:large|small|medium)\s+/i, '')
        .trim();
      const baseName = sourceForName || cleanedSource;
      const singular = singularize(baseName);
      const suffix = prefix.startsWith('zest') ? 'zest' : 'juice';
      return {
        cleaned: `${singular} ${suffix}`.trim(),
        note: `from ${cleanedSource}`
      };
    }
  }
  return undefined;
}

function extractVagueQuantity(value: string): VagueQuantityResult | undefined {
  for (const pattern of VAGUE_QUANTITY_PATTERNS) {
    const match = value.match(pattern.regex);
    if (match) {
      let remainder = value.slice(match[0].length).trim();
      remainder = remainder.replace(/^of\s+/i, '').trim();
      return {
        remainder,
        note: pattern.note
      };
    }
  }
  return undefined;
}

function extractParentheticals(value: string): ParentheticalExtraction {
  let optional = false;
  let measurement: QuantityShape | undefined;
  const notes: string[] = [];

  const cleaned = value.replace(/\(([^)]+)\)/g, (_match, group) => {
    const trimmed = String(group).trim();
    if (!trimmed) return '';
    if (/optional/i.test(trimmed)) {
      optional = true;
      return '';
    }
    const maybeMeasurement = parseMeasurement(trimmed);
    if (maybeMeasurement && !measurement) {
      measurement = maybeMeasurement;
      return '';
    }
    notes.push(trimmed);
    return '';
  });

  return {
    cleaned: cleaned.replace(/\s+/g, ' ').trim(),
    measurement,
    notes,
    optional
  };
}

function parseMeasurement(value: string): QuantityShape | undefined {
  const stripped = value.replace(/^(about|around|approximately|approx\.?|roughly)\s+/i, '').trim();
  const match = stripped.match(
    /^((?:\d+\s+)?\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?:\s*)([a-zA-Z]+)?$/
  );
  if (!match) return undefined;
  const amount = parseNumber(match[1]);
  if (amount === null) return undefined;
  const unit = match[2] ? normalizeUnit(match[2]) ?? match[2].toLowerCase() : null;
  return { amount, unit };
}

function extractQuantity(value: string): QuantityExtraction {
  let working = value.trim();
  const notes: string[] = [];
  let amount: number | null = null;
  let originalAmount: number | null = null;
  let unit: string | null = null;
  let descriptor: string | undefined;

  while (QUALIFIER_REGEX.test(working)) {
    working = working.replace(QUALIFIER_REGEX, '').trim();
  }

  const rangeMatch = working.match(RANGE_REGEX);
  if (rangeMatch) {
    amount = parseNumber(rangeMatch[1]);
    originalAmount = amount;
    const rangeText = rangeMatch[0].trim();
    const afterRange = working.slice(rangeMatch[0].length).trim();
    const descriptorMatch = afterRange.match(/^([a-zA-Z]+)/);
    if (descriptorMatch && COUNT_DESCRIPTORS.has(descriptorMatch[1].toLowerCase())) {
      notes.push(`${rangeText} ${descriptorMatch[1]}`);
    } else {
      notes.push(rangeText);
    }
    working = afterRange;
  } else {
    const numberMatch = working.match(NUMBER_REGEX);
    if (numberMatch) {
      amount = parseNumber(numberMatch[1]);
      originalAmount = amount;
      working = working.slice(numberMatch[0].length).trim();
    }
  }

  if (working) {
    const unitMatch = working.match(/^([a-zA-Z]+)\b/);
    if (unitMatch) {
      const normalized = normalizeUnit(unitMatch[1]);
      if (normalized) {
        unit = normalized;
        working = working.slice(unitMatch[0].length).trim();
      } else if (COUNT_DESCRIPTORS.has(unitMatch[1].toLowerCase())) {
        descriptor = unitMatch[1];
        working = working.slice(unitMatch[0].length).trim();
      }
    }
  }

  return {
    amount,
    unit,
    descriptor,
    remainder: working.trim(),
    notes,
    originalAmount
  };
}

function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+\s+\d+\/\d+$/.test(trimmed)) {
    const [whole, fraction] = trimmed.split(/\s+/);
    return parseInt(whole, 10) + parseFraction(fraction);
  }
  if (/^\d+\/\d+$/.test(trimmed)) {
    return parseFraction(trimmed);
  }
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseFraction(value: string): number {
  const [numerator, denominator] = value.split('/').map(Number);
  if (!denominator) return numerator;
  return numerator / denominator;
}

function normalizeUnit(raw: string): string | null {
  const lower = raw.toLowerCase();
  if (UNIT_SYNONYMS[lower]) {
    return UNIT_SYNONYMS[lower];
  }
  if (raw === 'T') return 'tbsp';
  if (raw === 't') return 'tsp';
  if (raw === 'C') return 'cup';
  return null;
}

function mergeQuantities(
  extracted: QuantityExtraction,
  measurement?: QuantityShape
): { quantity: QuantityShape; usedParenthetical: boolean } {
  const quantity: QuantityShape = {
    amount: extracted.amount ?? null,
    unit: extracted.unit ?? null
  };

  if (!measurement) {
    return { quantity, usedParenthetical: false };
  }

  const measurementUnit = measurement.unit?.toLowerCase() ?? null;
  const shouldPrefer =
    !quantity.unit ||
    (measurementUnit !== null && WEIGHT_PRIORITY_UNITS.has(measurementUnit));

  if (shouldPrefer) {
    return {
      quantity: {
        amount: measurement.amount,
        unit: measurement.unit ?? null
      },
      usedParenthetical: true
    };
  }

  return { quantity, usedParenthetical: false };
}

function extractNameAndPrep(value: string): {
  name?: string;
  prep?: string;
  notes: string[];
} {
  let working = value.trim();
  const notes: string[] = [];
  let prep: string | undefined;

  const lastComma = working.lastIndexOf(',');
  if (lastComma >= 0) {
    const trailing = working.slice(lastComma + 1).trim();
    if (isPrepPhrase(trailing)) {
      prep = trailing;
      working = working.slice(0, lastComma).trim();
    }
  }

  working = working.replace(/^[,.\s-]+/, '').trim();
  working = working.replace(/^of\s+/i, '').trim();

  if (!working) {
    return { name: undefined, prep, notes };
  }

  let name = cleanupIngredientName(working);

  return {
    name: name || undefined,
    prep,
    notes
  };
}

function cleanupIngredientName(value: string): string {
  let result = value.trim();

  if (/^cans?\b/i.test(result)) {
    result = result.replace(/^cans?\b/i, 'canned').trim();
  }

  let changed = true;
  while (changed) {
    changed = false;
    if (/^of\s+/i.test(result)) {
      result = result.replace(/^of\s+/i, '').trim();
      changed = true;
      continue;
    }
    const match = result.match(/^(clove|cloves|sprig|sprigs|bunch|bunches|stick|sticks|slice|slices)\b/i);
    if (match) {
      result = result.slice(match[0].length).trim();
      changed = true;
    }
  }

  return result;
}

function isPrepPhrase(value: string): boolean {
  const normalized = value.toLowerCase();
  return PREP_PHRASES.includes(normalized);
}

function inferScaling(
  name: string | undefined,
  unit: string | null,
  amount: number | null,
  notes: string[],
  descriptor?: string
): Scaling {
  const lowerName = name?.toLowerCase() ?? '';
  const normalizedNotes = notes.map(note => note.toLowerCase());
  const descriptorLower = descriptor?.toLowerCase();

  if (
    lowerName.includes('egg') ||
    descriptorLower === 'clove' ||
    descriptorLower === 'cloves' ||
    normalizedNotes.some(note => note.includes('clove'))
  ) {
    return { mode: 'discrete', step: 1, rounding: 'nearest' };
  }

  if (descriptorLower === 'stick' || descriptorLower === 'sticks') {
    return { mode: 'discrete', step: 1, rounding: 'nearest' };
  }

  if (normalizedNotes.some(note => PURPOSE_KEYWORDS.some(keyword => note.includes(keyword)))) {
    return { mode: 'fixed' };
  }

  const isSpice = SPICE_KEYWORDS.some(keyword => lowerName.includes(keyword));
  const smallUnit = unit ? ['tsp', 'tbsp', 'dash', 'pinch'].includes(unit) : false;
  if (
    normalizedNotes.some(note => note.includes('to taste')) ||
    (isSpice && (smallUnit || (amount !== null && amount <= 1)))
  ) {
    return { mode: 'proportional', factor: 0.7 };
  }

  return { mode: 'linear' };
}

function formatNotes(notes: string[]): string | undefined {
  const cleaned = Array.from(
    new Set(
      notes
        .map(note => note.trim())
        .filter(Boolean)
    )
  );
  return cleaned.length ? cleaned.join('; ') : undefined;
}

function formatCountNote(amount: number, descriptor: string): string {
  const lower = descriptor.toLowerCase();
  const singular = lower.endsWith('s') ? lower.slice(0, -1) : lower;
  const word =
    amount === 1
      ? singular
      : singular.endsWith('ch') || singular.endsWith('sh') || singular.endsWith('s') || singular.endsWith('x') || singular.endsWith('z')
      ? `${singular}es`
      : singular.endsWith('y') && !/[aeiou]y$/.test(singular)
      ? `${singular.slice(0, -1)}ies`
      : `${singular}s`;
  return `${formatDecimal(amount)} ${word}`;
}

function singularize(value: string): string {
  const trimmed = value.trim();
  if (trimmed.endsWith('ies')) {
    return `${trimmed.slice(0, -3)}y`;
  }
  if (/(ches|shes|sses|xes|zes)$/i.test(trimmed)) {
    return trimmed.slice(0, -2);
  }
  if (trimmed.endsWith('s')) {
    return trimmed.slice(0, -1);
  }
  return trimmed;
}
