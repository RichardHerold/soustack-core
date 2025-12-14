import { ParsedYield } from '../types';

const RANGE_PATTERN = /^(\d+)(?:\s*(?:[-–—]|to)\s*)(\d+)\s+(.+)$/i;
const MAKES_PREFIX = /^(makes?|yields?)\s*:?\s*(.+)$/i;
const APPROX_PREFIX = /^(about|around|approximately|approx\.?|roughly)\s+/i;
const SERVING_UNITS = ['servings', 'serving', 'portions', 'portion', 'people', 'persons'];
const DEFAULT_DOZEN_UNIT = 'cookies';

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
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
  twelve: 12
};

export function normalizeYield(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .normalize('NFKC')
    .replace(/\u00A0/g, ' ')
    .replace(/[–—−]/g, '-')
    .trim()
    .replace(/\s+/g, ' ');
}

export function parseYield(text: string): ParsedYield | null {
  const normalized = normalizeYield(text);
  if (!normalized) return null;

  const { main, paren } = extractParenthetical(normalized);
  const core = parseYieldCore(main, normalized);
  if (!core) return null;

  const servingsFromParen = paren ? extractServingsFromParen(paren) : null;
  if (servingsFromParen !== null) {
    core.servings = servingsFromParen;
    core.description = normalized;
  }

  if (core.servings === undefined) {
    const inferred = inferServings(core.amount, core.unit);
    if (inferred !== undefined) {
      core.servings = inferred;
    }
  }

  return core;
}

export function formatYield(value: ParsedYield): string {
  if (value.description) {
    return value.description;
  }

  if (value.servings && value.unit === 'servings') {
    return `Serves ${value.amount}`;
  }

  let result = `${value.amount} ${value.unit}`.trim();
  if (value.servings && value.unit !== 'servings') {
    result += ` (${value.servings} servings)`;
  }

  return result;
}

function parseYieldCore(text: string, original: string): ParsedYield | null {
  return (
    parseServesPattern(text, original) ??
    parseMakesPattern(text, original) ??
    parseRangePattern(text, original) ??
    parseNumberUnitPattern(text, original) ??
    parsePlainNumberPattern(text)
  );
}

function parseServesPattern(text: string, original: string): ParsedYield | null {
  const patterns = [
    /^serves?\s*[:\-]?\s*(\d+)(?:\s*(?:[-–—]|to)\s*(\d+))?/i,
    /^servings?\s*[:\-]?\s*(\d+)(?:\s*(?:[-–—]|to)\s*(\d+))?/i,
    /^serving\s*[:\-]?\s*(\d+)(?:\s*(?:[-–—]|to)\s*(\d+))?/i,
    /^makes?\s*[:\-]?\s*(\d+)(?:\s*(?:[-–—]|to)\s*(\d+))?\s+servings?$/i,
    /^(\d+)\s+servings?$/i
  ];

  for (const regex of patterns) {
    const match = text.match(regex);
    if (!match) continue;
    const amount = parseInt(match[1], 10);
    if (Number.isNaN(amount)) continue;
    const result: ParsedYield = {
      amount,
      unit: 'servings',
      servings: amount
    };
    if (match[2]) {
      result.description = original;
    }
    return result;
  }

  return null;
}

function parseMakesPattern(text: string, original: string): ParsedYield | null {
  const match = text.match(MAKES_PREFIX);
  if (!match) return null;
  const remainder = match[2].trim();
  if (!remainder) return null;

  const servingsMatch = remainder.match(/^(\d+)(?:\s*(?:[-–—]|to)\s*(\d+))?\s+servings?$/i);
  if (servingsMatch) {
    const amount = parseInt(servingsMatch[1], 10);
    const result: ParsedYield = {
      amount,
      unit: 'servings',
      servings: amount
    };
    if (servingsMatch[2]) {
      result.description = original;
    }
    return result;
  }

  return (
    parseRangePattern(remainder, original) ??
    parseNumberUnitPattern(remainder, original) ??
    parsePlainNumberPattern(remainder)
  );
}

function parseRangePattern(text: string, descriptionSource: string): ParsedYield | null {
  const match = text.match(RANGE_PATTERN);
  if (!match) return null;
  const amount = parseInt(match[1], 10);
  const unit = cleanupUnit(match[3]);
  if (!unit) return null;
  const result: ParsedYield = {
    amount,
    unit,
    description: descriptionSource
  };
  return result;
}

function parseNumberUnitPattern(text: string, descriptionSource: string): ParsedYield | null {
  if (!text) return null;
  const { value, approximate } = stripApproximation(text);
  if (!value) return null;

  const dozenResult = handleDozen(value);
  if (dozenResult) {
    const unit = cleanupUnit(dozenResult.remainder || DEFAULT_DOZEN_UNIT);
    const parsed: ParsedYield = {
      amount: dozenResult.amount,
      unit
    };
    if (approximate) {
      parsed.description = descriptionSource;
    }
    return parsed;
  }

  const numericMatch = value.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (numericMatch) {
    const amount = parseFloat(numericMatch[1]);
    if (!Number.isNaN(amount)) {
      const unit = cleanupUnit(numericMatch[2]);
      if (unit) {
        const parsed: ParsedYield = { amount, unit };
        if (approximate) {
          parsed.description = descriptionSource;
        }
        return parsed;
      }
    }
  }

  const wordMatch = value.match(/^([a-zA-Z]+)\s+(.+)$/);
  if (wordMatch) {
    const amount = wordToNumber(wordMatch[1]);
    if (amount !== null) {
      const unit = cleanupUnit(wordMatch[2]);
      if (unit) {
        const parsed: ParsedYield = { amount, unit };
        if (approximate) {
          parsed.description = descriptionSource;
        }
        return parsed;
      }
    }
  }

  return null;
}

function parsePlainNumberPattern(text: string): ParsedYield | null {
  const match = text.match(/^(\d+)$/);
  if (!match) return null;
  const amount = parseInt(match[1], 10);
  if (Number.isNaN(amount)) return null;
  return {
    amount,
    unit: 'servings',
    servings: amount
  };
}

function stripApproximation(value: string): { value: string; approximate: boolean } {
  const match = value.match(APPROX_PREFIX);
  if (!match) {
    return { value: value.trim(), approximate: false };
  }
  const stripped = value.slice(match[0].length).trim();
  return { value: stripped, approximate: true };
}

function handleDozen(text: string): { amount: number; remainder: string } | null {
  const match = text.match(
    /^((?:\d+(?:\.\d+)?)|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a|an|half))\s+dozens?\b(.*)$/i
  );
  if (!match) return null;
  const token = match[1].toLowerCase();
  let multiplier: number | null = null;
  if (token === 'half') {
    multiplier = 0.5;
  } else if (!Number.isNaN(Number(token))) {
    multiplier = parseFloat(token);
  } else {
    multiplier = wordToNumber(token);
  }
  if (multiplier === null) return null;
  const amount = multiplier * 12;
  return {
    amount,
    remainder: match[2].trim()
  };
}

function cleanupUnit(value: string): string {
  let unit = value.trim();
  unit = unit.replace(/^[,.-]+/, '').trim();
  unit = unit.replace(/[.,]+$/, '').trim();
  unit = unit.replace(/^of\s+/i, '').trim();
  return unit;
}

function extractParenthetical(text: string): { main: string; paren: string | null } {
  const match = text.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (!match) {
    return { main: text, paren: null };
  }
  return {
    main: match[1].trim(),
    paren: match[2].trim()
  };
}

function extractServingsFromParen(text: string): number | null {
  const match = text.match(/(\d+)/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  return Number.isNaN(value) ? null : value;
}

function inferServings(amount: number, unit: string): number | undefined {
  if (SERVING_UNITS.includes(unit.toLowerCase())) {
    return amount;
  }
  return undefined;
}

function wordToNumber(word: string): number | null {
  const normalized = word.toLowerCase();
  if (NUMBER_WORDS.hasOwnProperty(normalized)) {
    return NUMBER_WORDS[normalized];
  }
  return null;
}
