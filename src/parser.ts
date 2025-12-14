import { 
  Recipe, 
  Ingredient, 
  IngredientItem, 
  Instruction, 
  InstructionItem,
  Scaling 
} from './types';

// --- Output Types ---

/**
 * A "Computed Recipe" is the result of running the parser.
 * It is flat, strict, and ready for the UI to render.
 */
export interface ComputedRecipe {
  metadata: {
    targetYield: number;
    baseYield: number;
    multiplier: number;
  };
  ingredients: ComputedIngredient[];
  instructions: ComputedInstruction[];
  timing: {
    active: number;
    passive: number;
    total: number;
  };
}

export interface ComputedIngredient {
  id: string;
  name: string;
  amount: number;
  unit: string | null;
  text: string; // "500g Bread Flour"
  notes?: string;
}

export interface ComputedInstruction {
  id: string;
  text: string;
  durationMinutes: number;
  type: 'active' | 'passive';
}

// --- Main Logic ---

export function scaleRecipe(recipe: Recipe, targetYieldAmount: number): ComputedRecipe {
  // 1. Calculate Multiplier
  const baseYield = recipe.yield?.amount || 1;
  const multiplier = targetYieldAmount / baseYield;

  // 2. Flatten Ingredients (handle subsections)
  const flatIngredients = flattenIngredients(recipe.ingredients);

  // 3. Two-Pass Ingredient Scaling
  // Pass 1: Scale Independent items (Linear, Fixed, Discrete)
  // Pass 2: Scale Dependent items (Baker's %, Proportional)
  const scaledIngredientsMap = new Map<string, ComputedIngredient>();

  // --- PASS 1 ---
  flatIngredients.forEach(ing => {
    if (isIndependent(ing.scaling?.type)) {
      const computed = calculateIngredient(ing, multiplier, 0); // Reference unused here
      scaledIngredientsMap.set(ing.id || ing.item, computed);
    }
  });

  // --- PASS 2 ---
  flatIngredients.forEach(ing => {
    if (!isIndependent(ing.scaling?.type)) {
      // Find the reference ingredient's NEW weight
      let referenceValue = 0;
      if (ing.scaling?.type === 'bakers_percentage' && ing.scaling.referenceId) {
        const refIng = scaledIngredientsMap.get(ing.scaling.referenceId);
        if (refIng) referenceValue = refIng.amount;
      } else {
        // Fallback for Proportional: Use generic multiplier if no ref logic defined
        referenceValue = multiplier; 
      }
      
      const computed = calculateIngredient(ing, multiplier, referenceValue);
      scaledIngredientsMap.set(ing.id || ing.item, computed);
    }
  });

  // 4. Scale Instructions (Timing)
  const flatInstructions = flattenInstructions(recipe.instructions);
  const computedInstructions = flatInstructions.map(inst => 
    calculateInstruction(inst, multiplier)
  );

  // 5. Aggregate Time
  const timing = computedInstructions.reduce(
    (acc, step) => {
      if (step.type === 'active') acc.active += step.durationMinutes;
      else acc.passive += step.durationMinutes;
      acc.total += step.durationMinutes;
      return acc;
    },
    { active: 0, passive: 0, total: 0 }
  );

  return {
    metadata: {
      targetYield: targetYieldAmount,
      baseYield,
      multiplier
    },
    ingredients: Array.from(scaledIngredientsMap.values()),
    instructions: computedInstructions,
    timing
  };
}

// --- Helper Functions ---

function isIndependent(type?: string): boolean {
  return !type || type === 'linear' || type === 'fixed' || type === 'discrete';
}

function calculateIngredient(
  ing: Ingredient, 
  multiplier: number, 
  referenceValue: number
): ComputedIngredient {
  const baseAmount = ing.quantity?.amount || 0;
  const type = ing.scaling?.type || 'linear';
  let newAmount = baseAmount;

  switch (type) {
    case 'linear':
      newAmount = baseAmount * multiplier;
      break;
    
    case 'fixed':
      newAmount = baseAmount;
      break;

    case 'discrete':
      // e.g., Eggs. Round to nearest step (default 1)
      const raw = baseAmount * multiplier;
      const step = (ing.scaling as any).roundTo || 1; 
      newAmount = Math.round(raw / step) * step;
      // Handle min/max constraints
      break;

    case 'bakers_percentage':
      // Formula: NewAmount = ReferenceNewAmount * OriginalRatio
      // If explicit factor provided (e.g. 0.02 for 2% salt):
      // NewAmount = ReferenceNewAmount * Factor
      
      // Calculate original ratio if not provided? 
      // Ideally, factor is implicit: (OldAmount / OldRefAmount). 
      // But for simplicity here, we assume the relationship holds true to the Ref.
      
      // If we used the Reference Value from Pass 1 (e.g., 1000g flour),
      // We need the *Original* Ratio.
      // NOTE: In a real app, you calculate the original ratio from the unscaled recipe first.
      // For this snippet, let's assume 'factor' exists or we derive it.
      
      // Simpler approach for v0.1: Re-calculate the ratio dynamically
      // But we passed in 'referenceValue' (The NEW amount of flour).
      // We need the OLD amount of flour to get the ratio.
      // *Simplification*: Just treat it like linear scaling relative to the ref? 
      // Actually, Baker's % is linear to the flour.
      // Ratio = BaseAmount / BaseRefAmount (need lookup).
      // Let's rely on standard scaling: If flour doubled, salt doubles.
      // Baker's % is mostly useful if you change the RATIO (e.g., "Make 75% hydration dough").
      // If we are just scaling yield, Baker's % behaves exactly like Linear.
      
      newAmount = baseAmount * multiplier; 
      break;
  }

  // Apply formatted text
  const unit = ing.quantity?.unit || '';
  // Extract ingredient name: use ing.name if available, otherwise strip quantity from ing.item
  const ingredientName = ing.name || extractNameFromItem(ing.item);
  const text = `${parseFloat(newAmount.toFixed(2))}${unit ? ' ' + unit : ''} ${ingredientName}`;

  return {
    id: ing.id || ing.item,
    name: ingredientName,
    amount: newAmount,
    unit: ing.quantity?.unit || null,
    text,
    notes: ing.notes
  };
}

/**
 * Extracts the ingredient name from an item string by removing the leading quantity.
 * Example: "900g Bread Flour" -> "Bread Flour"
 */
function extractNameFromItem(item: string): string {
  // Match pattern: optional number, optional decimal, optional unit, then the name
  // Examples: "900g Bread Flour", "2 cups flour", "100g Whole Wheat Flour"
  const match = item.match(/^\s*\d+(?:\.\d+)?\s*\w*\s*(.+)$/);
  return match ? match[1].trim() : item;
}

function calculateInstruction(inst: Instruction, multiplier: number): ComputedInstruction {
  const baseDuration = inst.timing?.duration || 0;
  const scalingType = inst.timing?.scaling || 'fixed'; // Default steps to fixed (baking time doesn't usually double)
  let newDuration = baseDuration;

  if (scalingType === 'linear') {
    newDuration = baseDuration * multiplier;
  } else if (scalingType === 'sqrt') {
    // Physics approximation for heating larger volumes
    newDuration = baseDuration * Math.sqrt(multiplier);
  }

  return {
    id: inst.id || 'step',
    text: inst.text,
    durationMinutes: Math.ceil(newDuration),
    type: inst.timing?.type || 'active'
  };
}

// --- Flattening Helpers ---

function flattenIngredients(items: IngredientItem[]): Ingredient[] {
  const result: Ingredient[] = [];
  items.forEach(item => {
    if (typeof item === 'string') {
      // Basic string support (no scaling possible)
      result.push({ item, quantity: { amount: 0, unit: null }, scaling: { type: 'fixed' } });
    } else if ('subsection' in item) {
      result.push(...flattenIngredients(item.items));
    } else {
      result.push(item);
    }
  });
  return result;
}

function flattenInstructions(items: InstructionItem[]): Instruction[] {
  const result: Instruction[] = [];
  items.forEach(item => {
    if (typeof item === 'string') {
      result.push({ text: item, timing: { duration: 0, type: 'active' } as any });
    } else if ('subsection' in item) {
      result.push(...flattenInstructions(item.items));
    } else {
      result.push(item);
    }
  });
  return result;
}