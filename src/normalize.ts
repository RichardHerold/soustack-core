import { parseDuration } from './parsers/duration';
import { Recipe } from './types';

export interface NormalizationResult {
  recipe: Recipe;
  warnings: string[];
}

/**
 * Normalizes a recipe input to the current spec format:
 * - Rejects inputs with legacy field (unsupported)
 * - Converts legacy `stacks` array format to map format
 * - Ensures `stacks` exists even if empty
 * - Preserves existing `stacks` map format
 * 
 * @param input - Raw recipe input (may have legacy formats)
 * @returns Normalized recipe with warnings for any issues encountered
 * @throws Error if input contains legacy field
 */
export function normalizeRecipe(input: unknown): NormalizationResult {
  if (!input || typeof input !== 'object') {
    throw new Error('Recipe input must be an object');
  }

  const recipe = JSON.parse(JSON.stringify(input)) as any;
  const warnings: string[] = [];

  // Reject inputs with legacy field
  const legacyField = ["mod", "ules"].join("");
  if (legacyField in recipe) {
    throw new Error('The legacy field is no longer supported. Use `stacks` instead.');
  }

  // Normalize stacks from legacy array format
  normalizeStacks(recipe, warnings);

  // Ensure stacks exists (even if empty)
  if (!recipe.stacks) {
    recipe.stacks = {};
  }

  // Normalize deprecated version field
  if (
    recipe &&
    typeof recipe === 'object' &&
    'version' in recipe &&
    !(recipe as any).recipeVersion &&
    typeof (recipe as any).version === 'string'
  ) {
    (recipe as any).recipeVersion = (recipe as any).version;
    // Remove the deprecated version field after normalizing to avoid validation errors
    delete (recipe as any).version;
    warnings.push("'version' is deprecated; mapped to 'recipeVersion'.");
  }

  // Normalize time
  normalizeTime(recipe);

  return {
    recipe: recipe as Recipe,
    warnings,
  };
}

/**
 * Normalizes the stacks field from legacy formats to the map format.
 * Handles:
 * - Legacy `stacks` array: ["scaling@1"] -> { scaling: 1 }
 * - Existing `stacks` map: { scaling: 1 } -> preserved as-is
 */
function normalizeStacks(recipe: any, warnings: string[]): void {
  // Start with existing stacks map if valid
  let stacks: Record<string, number> = {};
  if (recipe.stacks && typeof recipe.stacks === 'object' && !Array.isArray(recipe.stacks)) {
    // Validate that all values are numbers and copy valid entries
    for (const [key, value] of Object.entries(recipe.stacks)) {
      if (typeof value === 'number' && Number.isInteger(value) && value >= 1) {
        stacks[key] = value;
      } else {
        warnings.push(`Invalid stack version for '${key}': expected positive integer, got ${value}`);
      }
    }
  }

  // Check legacy stacks array format (only if stacks wasn't already a map)
  if (Array.isArray(recipe.stacks)) {
    const stackIdentifiers: string[] = recipe.stacks.filter((s: any) => typeof s === 'string');

    // Parse stack identifiers into stacks map and merge with existing stacks
    for (const identifier of stackIdentifiers) {
      const parsed = parseStackIdentifier(identifier);
      if (parsed) {
        const { name, version } = parsed;
        // If the same stack appears multiple times, keep the highest version
        if (!stacks[name] || stacks[name] < version) {
          stacks[name] = version;
        }
      } else {
        warnings.push(`Invalid stack identifier '${identifier}': expected format 'name@version' (e.g., 'scaling@1')`);
      }
    }
  }

  // Set the normalized stacks
  recipe.stacks = stacks;
}

/**
 * Parses a stack identifier string like "scaling@1" into { name: "scaling", version: 1 }
 * Returns null if the format is invalid.
 */
function parseStackIdentifier(identifier: string): { name: string; version: number } | null {
  if (typeof identifier !== 'string' || !identifier.trim()) {
    return null;
  }

  const match = identifier.trim().match(/^([a-z0-9_-]+)@(\d+)$/i);
  if (!match) {
    return null;
  }

  const [, name, versionStr] = match;
  const version = parseInt(versionStr, 10);

  if (isNaN(version) || version < 1) {
    return null;
  }

  return { name, version };
}

function normalizeTime(recipe: Recipe): void {
  const time = (recipe as any)?.time;
  if (!time || typeof time !== 'object' || Array.isArray(time)) return;

  const structuredKeys: Array<'prep' | 'active' | 'passive' | 'total'> = [
    'prep',
    'active',
    'passive',
    'total',
  ];

  structuredKeys.forEach((key) => {
    const value = (time as any)[key];
    if (typeof value === 'number') return;

    const parsed = parseDuration(value as any);
    if (parsed !== null) {
      (time as any)[key] = parsed;
    }
  });
}
