import {
  Recipe,
  Ingredient,
  IngredientItem,
  Instruction,
  InstructionItem,
  Equipment,
  ScaledRecipe,
  EquipmentUpgradeRecommendation
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
  const scaled: ScaledRecipe = deepClone(recipe);

  applyYieldScaling(scaled, options, multiplier);
  const equipmentUpgrades = scaleEquipment(scaled.equipment || [], multiplier);

  const baseAmounts = collectBaseIngredientAmounts(scaled.ingredients || []);
  const scaledAmounts = new Map<string, number>();
  const orderedIngredients: Ingredient[] = [];

  collectIngredients(scaled.ingredients || [], orderedIngredients);

  orderedIngredients
    .filter(ing => {
      const mode = (ing.scaling as any)?.mode || (ing.scaling as any)?.type || 'linear';
      return mode !== 'bakersPercent' && mode !== 'bakers_percentage';
    })
    .forEach(ing => {
      const key = getIngredientKey(ing);
      scaledAmounts.set(key, calculateIndependentIngredient(ing, multiplier));
    });

  orderedIngredients
    .filter(ing => {
      const mode = (ing.scaling as any)?.mode || (ing.scaling as any)?.type;
      return mode === 'bakersPercent' || mode === 'bakers_percentage';
    })
    .forEach(ing => {
      const key = getIngredientKey(ing);
      const scaling = ing.scaling as any;
      const referenceId = scaling?.of || scaling?.referenceId;
      const percent = scaling?.percent || scaling?.factor;

      if (!referenceId) {
        throw new Error(`Baker's percentage ingredient "${key}" is missing a reference (of/referenceId)`);
      }

      const referenceAmount = scaledAmounts.get(referenceId);
      if (referenceAmount === undefined) {
        throw new Error(`Reference ingredient "${referenceId}" not found for baker's percentage item "${key}"`);
      }

      const baseAmount = ing.quantity?.amount || 0;
      const referenceBase = baseAmounts.get(referenceId);
      const calculatedPercent = percent ?? (referenceBase ? (baseAmount / referenceBase) * 100 : undefined);
      if (calculatedPercent === undefined) {
        throw new Error(`Unable to determine percentage for baker's percentage ingredient "${key}"`);
      }

      scaledAmounts.set(key, referenceAmount * (calculatedPercent / 100));
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

  scaled.scaling = {
    ...(scaled.scaling ?? {}),
    multiplier,
    equipment: {
      upgrades: equipmentUpgrades
    }
  };

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
  return ing.id || ing.name;
}

function calculateIndependentIngredient(ing: Ingredient, multiplier: number): number {
  const baseAmount = ing.quantity?.amount || 0;
  const scaling = ing.scaling as any;
  const mode = scaling?.mode || scaling?.type || 'linear';

  switch (mode) {
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
    if ('section' in item) {
      collectIngredients(item.ingredients, bucket);
    } else {
      bucket.push(item);
    }
  });
}

function collectBaseIngredientAmounts(items: IngredientItem[], map = new Map<string, number>()) {
  items.forEach(item => {
    if (typeof item === 'string') return;
    if ('section' in item) {
      collectBaseIngredientAmounts(item.ingredients, map);
    } else {
      map.set(getIngredientKey(item), item.quantity?.amount ?? 0);
    }
  });
  return map;
}

function scaleInstructionItems(items: InstructionItem[], multiplier: number) {
  items.forEach(item => {
    if (typeof item === 'string') return;

    if ('section' in item) {
      scaleInstructionItems(item.steps, multiplier);
      return;
    }

    const timing = item.timing;
    if (!timing || !timing.duration) return;

    // Handle DurationMinutes format: { minutes: number }
    const baseDuration = typeof timing.duration === 'object' && 'minutes' in timing.duration
      ? timing.duration.minutes
      : toDurationMinutes(timing.duration as any);
    
    // Default to linear scaling for timing (vNext doesn't have scaling property)
    const newDuration = Math.ceil(baseDuration * multiplier);

    if (typeof timing.duration === 'object' && 'minutes' in timing.duration) {
      timing.duration.minutes = newDuration;
    } else {
      // Fallback for legacy format
      (timing as any).duration = newDuration;
    }
  });
}

function scaleEquipment(items: (Equipment | string)[], multiplier: number): EquipmentUpgradeRecommendation[] {
  const upgrades: EquipmentUpgradeRecommendation[] = [];

  items.forEach(item => {
    if (typeof item === 'string') return;

    const scaledCount = calculateEquipmentCount(item, multiplier);
    if (scaledCount !== undefined) {
      item.count = scaledCount;
    }

    const upgrade = chooseEquipmentUpgrade(item, multiplier);
    if (upgrade) {
      upgrades.push(upgrade);
    }
  });

  return upgrades;
}

function calculateEquipmentCount(equipment: Equipment, multiplier: number): number | undefined {
  const baseCount = equipment.count ?? 1;
  const scaling = equipment.countScaling;

  if (!scaling) {
    return equipment.count;
  }

  if (scaling === 'fixed') {
    return baseCount;
  }

  if (scaling === 'linear') {
    return Math.ceil(baseCount * multiplier);
  }

  if (typeof scaling === 'object' && scaling.mode === 'threshold') {
    const steps = scaling.steps || [];
    if (steps.length === 0) {
      return equipment.count;
    }

    const matchedStep = steps.find(step => multiplier <= step.maxFactor);
    const selected = matchedStep ?? steps[steps.length - 1];
    return selected.count;
  }

  return equipment.count;
}

function chooseEquipmentUpgrade(equipment: Equipment, multiplier: number): EquipmentUpgradeRecommendation | null {
  if (!equipment.upgrades || equipment.upgrades.length === 0 || !equipment.id) {
    return null;
  }

  const eligible = equipment.upgrades.filter(rule => multiplier >= rule.minFactor);
  if (eligible.length === 0) {
    return null;
  }

  const selected = eligible.reduce((best, current) => current.minFactor > best.minFactor ? current : best, eligible[0]);

  return {
    fromId: equipment.id,
    use: selected.use,
    minFactor: selected.minFactor
  };
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
