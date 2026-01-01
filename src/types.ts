/**
 * Soustack Recipe Schema v0.0.2
 * A portable, scalable, interoperable recipe format.
 */

export interface SoustackRecipe {
  /** Document marker for Soustack recipes */
  '@type'?: 'Recipe';
  /** Optional $schema pointer for profile-aware validation */
  $schema?: string;
  /** Optional declared validation profile */
  profile?: "base" | "equipped" | "illustrated" | "lite" | "prepped" | "scalable" | "timed";
  /** Stack declarations as a map: Record<stackName, versionNumber> */
  stacks?: Record<string, number>;
  /** Unique identifier (slug or UUID) */
  id?: string;
  /** Optional display title */
  title?: string;
  /** The title of the recipe */
  name: string;
  /** Semantic versioning (e.g., 1.0.0) */
  recipeVersion?: string;
  /** Deprecated alias for recipeVersion */
  version?: string;
  description?: string;
  /** Primary category (e.g., "Main Course") */
  category?: string;
  /** Additional tags for filtering */
  tags?: string[];
  /** URL(s) to recipe image(s) */
  images?: string[];
  /** URL(s) to recipe video(s) */
  videos?: string[];
  /** Legacy image field preserved for compatibility */
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
  metadata?: Record<string, unknown>;
  [k: `x-${string}`]: unknown;
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
 * Time uses DurationMinutes format.
 * Required total field with minutes.
 */
export interface Time {
  total: DurationMinutes;
  metadata?: Record<string, unknown>;
  [k: `x-${string}`]: unknown;
}

export interface DurationMinutes {
  minutes: number;
  metadata?: Record<string, unknown>;
  [k: `x-${string}`]: unknown;
}

export interface StorageDuration {
  iso8601: string;
  metadata?: Record<string, unknown>;
  [k: `x-${string}`]: unknown;
}

export interface Equipment {
  id?: string;
  name: string;
  required?: boolean;
  label?: string;
  capacity?: Quantity;
  scalingLimit?: number;
  alternatives?: string[];
  count?: number;
  countScaling?: EquipmentCountScaling;
  upgrades?: EquipmentUpgradeRule[];
}

export interface Quantity {
  amount: number;
  /** Unit string (e.g. "g", "cup") or null for count-based items (e.g. "2 eggs") */
  unit: string | null;
}

export type EquipmentCountScaling = 'fixed' | 'linear' | EquipmentThresholdScaling;

export interface EquipmentThresholdScaling {
  mode: 'threshold';
  steps: EquipmentThresholdStep[];
}

export interface EquipmentThresholdStep {
  maxFactor: number;
  count: number;
}

export interface EquipmentUpgradeRule {
  minFactor: number;
  use: string;
}

export interface EquipmentUpgradeRecommendation {
  fromId: string;
  use: string;
  minFactor: number;
}

export interface ScalingMetadata {
  multiplier: number;
  equipment?: {
    upgrades: EquipmentUpgradeRecommendation[];
  };
}

export type ScaledRecipe = Recipe & {
  scaling?: ScalingMetadata;
};

// --- Ingredient Logic ---

export type IngredientItem = string | Ingredient | IngredientSubsection;

export interface IngredientSubsection {
  section: string;
  ingredients: IngredientItem[];
}

export interface Ingredient {
  id?: string;
  /** Ingredient name (required) */
  name: string;
  quantity?: Quantity;
  /** Required prep state (e.g. "diced") or array of prep items */
  prep?: string | string[];
  /** ID of equipment where this ingredient goes */
  destination?: string;
  scaling?: Scaling;
  optional?: boolean;
  notes?: string;
  temperature?: Temperature;
  metadata?: Record<string, unknown>;
  [k: `x-${string}`]: unknown;
}

export interface ParsedIngredient {
  name: string;
  quantity?: {
    amount: number | null;
    unit: string | null;
  };
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
  | ScalingToTaste
  | ScalingBakersPercentage;

export interface ScalingBase {
  min?: number;
  max?: number;
}

export interface ScalingLinear extends ScalingBase {
  mode: "linear";
}

export interface ScalingDiscrete extends ScalingBase {
  mode: "discrete";
  step?: number;
  rounding?: "nearest" | "ceil" | "floor";
}

export interface ScalingProportional extends ScalingBase {
  mode: "proportional";
  factor?: number;
}

export interface ScalingFixed extends ScalingBase {
  mode: "fixed";
}

export interface ScalingToTaste {
  mode: "toTaste";
}

export interface ScalingBakersPercentage {
  mode: "bakersPercent";
  /** The percentage relative to the reference (e.g. 2 for 2%) */
  percent: number;
  /** The ID of the flour/base ingredient this is relative to */
  of: string;
}

// --- Instruction Logic ---

export type InstructionItem = string | Instruction | InstructionSubsection;

export interface InstructionSubsection {
  section: string;
  steps: InstructionItem[];
}

export interface SoustackInstruction {
  id?: string;
  text: string;
  /** IDs of steps that must complete before this one starts */
  dependsOn?: string[];
  /** IDs of ingredients used in this step */
  inputs?: string[];
  /** IDs of techniques used in this step */
  techniqueIds?: string[];
  /** IDs of equipment used in this step */
  usesEquipment?: string[];
  timing?: StepTiming;
  temperature?: Temperature;
  images?: string[];
  videos?: string[];
  metadata?: Record<string, unknown>;
  [k: `x-${string}`]: unknown;
}

export type Instruction = SoustackInstruction;

export interface StepTiming {
  activity: "active" | "passive";
  duration?: DurationMinutes | DurationRange;
  completionCue?: string;
  metadata?: Record<string, unknown>;
  [k: `x-${string}`]: unknown;
}

export interface DurationRange {
  minMinutes: number;
  maxMinutes: number;
  metadata?: Record<string, unknown>;
  [k: `x-${string}`]: unknown;
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
  duration: StorageDuration;
  notes?: string;
  metadata?: Record<string, unknown>;
  [k: `x-${string}`]: unknown;
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
  calories?: number;
  protein_g?: number;
}

export interface Temperature {
  value: number;
  unit: "celsius" | "fahrenheit";
  metadata?: Record<string, unknown>;
  [k: `x-${string}`]: unknown;
}
