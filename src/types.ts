/**
 * Soustack Recipe Schema v0.1
 * A portable, scalable, interoperable recipe format.
 */

export interface SoustackRecipe {
  /** Unique identifier (slug or UUID) */
  id?: string;
  /** The title of the recipe */
  name: string;
  /** Semantic versioning (e.g., 1.0.0) */
  version?: string;
  description?: string;
  /** Primary category (e.g., "Main Course") */
  category?: string;
  /** Additional tags for filtering */
  tags?: string[];
  /** URL(s) to recipe image(s) */
  image?: string | string[];
  /** ISO 8601 date string */
  dateAdded?: string;
  /** Last updated timestamp */
  dateModified?: string;
  source?: Source;
  yield?: Yield;
  time?: Time;
  equipment?: Equipment[];
  ingredients: IngredientItem[];
  instructions: InstructionItem[];
  storage?: Storage;
  substitutions?: Substitution[];
  nutrition?: NutritionFacts;
}

export type Recipe = SoustackRecipe;
// --- Core Definitions ---

export interface Source {
  author?: string;
  url?: string;
  name?: string;
  adapted?: boolean;
}

export interface Yield {
  amount: number;
  unit: string;
  servings?: number;
  description?: string;
}

export interface ParsedYield {
  amount: number;
  unit: string;
  servings?: number;
  description?: string;
}

/**
 * Time can be structured (machine-readable) or simple (strings).
 * Structured time takes precedence if both exist.
 */
export type Time = StructuredTime | SimpleTime;

export interface StructuredTime {
  prep?: number;
  active?: number;
  passive?: number;
  total?: number;
}

export interface SimpleTime {
  prepTime?: string;
  cookTime?: string;
}

export interface Equipment {
  id?: string;
  name: string;
  required?: boolean;
  label?: string;
  capacity?: Quantity;
  scalingLimit?: number;
  alternatives?: string[];
}

export interface Quantity {
  amount: number;
  /** Unit string (e.g. "g", "cup") or null for count-based items (e.g. "2 eggs") */
  unit: string | null;
}

// --- Ingredient Logic ---

export type IngredientItem = string | Ingredient | IngredientSubsection;

export interface IngredientSubsection {
  subsection: string;
  items: (string | Ingredient)[];
}

export interface Ingredient {
  id?: string;
  /** Full human-readable text (e.g. "2 cups flour") */
  item: string;
  quantity?: Quantity;
  name?: string;
  aisle?: string;
  /** Required prep state (e.g. "diced") */
  prep?: string;
  prepAction?: string;
  prepTime?: number;
  /** ID of equipment where this ingredient goes */
  destination?: string;
  scaling?: Scaling;
  critical?: boolean;
  optional?: boolean;
  notes?: string;
}

export interface ParsedIngredient {
  item: string;
  quantity?: {
    amount: number | null;
    unit: string | null;
  };
  name?: string;
  prep?: string;
  optional?: boolean;
  notes?: string;
  scaling?: Scaling;
}

/**
 * Intelligent Scaling Logic
 * Defines how an ingredient behaves when the recipe yield changes.
 */
export type Scaling =
  | ScalingLinear
  | ScalingDiscrete
  | ScalingProportional
  | ScalingFixed
  | ScalingBakersPercentage;

export interface ScalingBase {
  min?: number;
  max?: number;
}

export interface ScalingLinear extends ScalingBase {
  type: "linear";
}

export interface ScalingDiscrete extends ScalingBase {
  type: "discrete";
  roundTo?: number;
}

export interface ScalingProportional extends ScalingBase {
  type: "proportional";
  factor?: number;
}

export interface ScalingFixed extends ScalingBase {
  type: "fixed";
}

export interface ScalingBakersPercentage extends ScalingBase {
  type: 'bakers_percentage';
  /** The ID of the flour/base ingredient this is relative to */
  referenceId: string;
  /** The percentage relative to the reference (e.g. 0.02 for 2%) */
  factor?: number; // <--- ADD THIS LINE
}

// --- Instruction Logic ---

export type InstructionItem = string | Instruction | InstructionSubsection;

export interface InstructionSubsection {
  subsection: string;
  items: (string | Instruction)[];
}

export interface SoustackInstruction {
  id?: string;
  text: string;
  destination?: string;
  /** IDs of steps that must complete before this one starts */
  dependsOn?: string[];
  /** IDs of ingredients used in this step */
  inputs?: string[];
  timing?: StepTiming;
  /** Optional image URL for this instruction */
  image?: string;
}

export type Instruction = SoustackInstruction;

export interface StepTiming {
  duration: number;
  type: "active" | "passive";
  scaling?: "linear" | "fixed" | "sqrt";
}

// --- Advanced Metadata ---

export interface Storage {
  roomTemp?: StorageMethod;
  refrigerated?: StorageMethod;
  frozen?: FrozenStorageMethod;
  reheating?: string;
  makeAhead?: MakeAheadComponent[];
}

export interface StorageMethod {
  /** ISO 8601 duration (e.g. P3D) */
  duration: string;
  method?: string;
  notes?: string;
}

export interface FrozenStorageMethod extends StorageMethod {
  thawing?: string;
}

export interface MakeAheadComponent extends StorageMethod {
  component: string;
  storage: "roomTemp" | "refrigerated" | "frozen";
}

export interface Substitution {
  ingredient: string;
  critical?: boolean;
  notes?: string;
  alternatives?: Alternative[];
}

export interface Alternative {
  name: string;
  ratio: string;
  notes?: string;
  impact?: string;
  dietary?: string[];
}

export interface NutritionFacts {
  calories?: string;
  fatContent?: string;
  carbohydrateContent?: string;
  proteinContent?: string;
  fiberContent?: string;
  sugarContent?: string;
  sodiumContent?: string;
  servingSize?: string;
  [key: string]: string | number | null | string[] | undefined;
}
