import { Yield } from '../types';

export function parseYield(value: unknown): Yield | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'number') {
    return {
      amount: value,
      unit: 'servings'
    };
  }

  if (Array.isArray(value)) {
    return parseYield(value[0]);
  }

  if (typeof value === 'object') {
    const maybeYield = value as Record<string, any>;
    if (typeof maybeYield.amount === 'number') {
      return {
        amount: maybeYield.amount,
        unit: typeof maybeYield.unit === 'string' ? maybeYield.unit : 'servings',
        description:
          typeof maybeYield.description === 'string'
            ? maybeYield.description
            : undefined
      };
    }
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const match = trimmed.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      const amount = parseFloat(match[1]);
      const unit = trimmed.slice(match.index! + match[1].length).trim();
      return {
        amount,
        unit: unit || 'servings',
        description: trimmed
      };
    }
  }

  return undefined;
}

export function formatYield(yieldValue?: Yield): string | undefined {
  if (!yieldValue) return undefined;
  if (!yieldValue.amount && !yieldValue.unit) {
    return undefined;
  }

  const amount = yieldValue.amount ?? '';
  const unit = yieldValue.unit ? ` ${yieldValue.unit}` : '';
  return `${amount}${unit}`.trim() || yieldValue.description;
}
