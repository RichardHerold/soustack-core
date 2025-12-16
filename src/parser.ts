import {
  Recipe,
  Ingredient,
  IngredientItem,
  Instruction,
  InstructionItem
} from './types';
import { parseDuration } from './parsers/duration';

// --- Output Types ---

export interface ScaleRecipeOptions {
  multiplier?: number;
  targetYield?: {
    amount: number;
    unit?: string;
  };
}

// --- Main Logic ---

export function scaleRecipe(recipe: Recipe, options: ScaleRecipeOptions = {}): Recipe {
  const multiplier = resolveMultiplier(recipe, options);
  const scaled: Recipe = deepClone(recipe);

  applyYieldScaling(scaled, options, multiplier);

  const baseAmounts = collectBaseIngredientAmounts(scaled.ingredients || []);
  const scaledAmounts = new Map<string, number>();
  const orderedIngredients: Ingredient[] = [];

  collectIngredients(scaled.ingredients || [], orderedIngredients);

  orderedIngredients
    .filter(ing => (ing.scaling?.type || 'linear') !== 'bakers_percentage')
    .forEach(ing => {
      const key = getIngredientKey(ing);
      scaledAmounts.set(key, calculateIndependentIngredient(ing, multiplier));
    });

  orderedIngredients
    .filter(ing => ing.scaling?.type === 'bakers_percentage')
    .forEach(ing => {
      const key = getIngredientKey(ing);
      const scaling = ing.scaling as { referenceId?: string; factor?: number } | undefined;

      if (!scaling?.referenceId) {
        throw new Error(`Baker's percentage ingredient "${key}" is missing a referenceId`);
      }

      const referenceAmount = scaledAmounts.get(scaling.referenceId);
      if (referenceAmount === undefined) {
        throw new Error(`Reference ingredient "${scaling.referenceId}" not found for baker's percentage item "${key}"`);
      }

      const baseAmount = ing.quantity?.amount || 0;
      const referenceBase = baseAmounts.get(scaling.referenceId);
      const factor = scaling.factor ?? (referenceBase ? baseAmount / referenceBase : undefined);
      if (factor === undefined) {
        throw new Error(`Unable to determine factor for baker's percentage ingredient "${key}"`);
      }

      scaledAmounts.set(key, referenceAmount * factor);
    });

  orderedIngredients.forEach(ing => {
    const key = getIngredientKey(ing);
    const amount = scaledAmounts.get(key);
    if (amount === undefined) return;

    if (!ing.quantity) {
      ing.quantity = { amount, unit: null };
    } else {
      ing.quantity.amount = amount;
    }
  });

  scaleInstructionItems(scaled.instructions || [], multiplier);

  return scaled;
}

// --- Helper Functions ---

function resolveMultiplier(recipe: Recipe, options: ScaleRecipeOptions): number {
  if (options.multiplier && options.multiplier > 0) {
    return options.multiplier;
  }

  if (options.targetYield?.amount) {
    const base = recipe.yield?.amount || 1;
    return options.targetYield.amount / base;
  }

  return 1;
}

function applyYieldScaling(recipe: Recipe, options: ScaleRecipeOptions, multiplier: number) {
  const baseAmount = recipe.yield?.amount ?? 1;
  const targetAmount = options.targetYield?.amount ?? baseAmount * multiplier;
  const unit = options.targetYield?.unit ?? recipe.yield?.unit;

  if (!recipe.yield && !options.targetYield) return;

  recipe.yield = {
    amount: targetAmount,
    unit: unit ?? ''
  } as any;
}

function getIngredientKey(ing: Ingredient): string {
  return ing.id || ing.item;
}

function calculateIndependentIngredient(ing: Ingredient, multiplier: number): number {
  const baseAmount = ing.quantity?.amount || 0;
  const type = ing.scaling?.type || 'linear';

  switch (type) {
    case 'fixed':
      return baseAmount;
    case 'discrete': {
      const scaled = baseAmount * multiplier;
      const step = (ing.scaling as any)?.roundTo ?? 1;
      const rounded = Math.round(scaled / step) * step;
      return Math.round(rounded);
    }
    case 'proportional': {
      const factor = (ing.scaling as any)?.factor ?? 1;
      return baseAmount * multiplier * factor;
    }
    default:
      return baseAmount * multiplier;
  }
}

function collectIngredients(items: IngredientItem[], bucket: Ingredient[]) {
  items.forEach(item => {
    if (typeof item === 'string') return;
    if ('subsection' in item) {
      collectIngredients(item.items, bucket);
    } else {
      bucket.push(item);
    }
  });
}

function collectBaseIngredientAmounts(items: IngredientItem[], map = new Map<string, number>()) {
  items.forEach(item => {
    if (typeof item === 'string') return;
    if ('subsection' in item) {
      collectBaseIngredientAmounts(item.items, map);
    } else {
      map.set(getIngredientKey(item), item.quantity?.amount ?? 0);
    }
  });
  return map;
}

function scaleInstructionItems(items: InstructionItem[], multiplier: number) {
  items.forEach(item => {
    if (typeof item === 'string') return;

    if ('subsection' in item) {
      scaleInstructionItems(item.items, multiplier);
      return;
    }

    const timing = item.timing;
    if (!timing) return;

    const baseDuration = toDurationMinutes(timing.duration);
    const scalingType = timing.scaling || 'fixed';
    let newDuration = baseDuration;

    if (scalingType === 'linear') {
      newDuration = baseDuration * multiplier;
    } else if (scalingType === 'sqrt') {
      newDuration = baseDuration * Math.sqrt(multiplier);
    }

    timing.duration = Math.ceil(newDuration);
  });
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function toDurationMinutes(duration?: number | string): number {
  if (typeof duration === 'number' && Number.isFinite(duration)) {
    return duration;
  }

  if (typeof duration === 'string' && duration.trim().startsWith('P')) {
    const parsed = parseDuration(duration.trim());
    if (parsed !== null) {
      return parsed;
    }
  }

  return 0;
}