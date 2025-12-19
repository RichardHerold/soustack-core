import { Recipe } from './types';

export interface NormalizationResult {
  recipe: Recipe;
  warnings: string[];
}

/**
 * Normalizes a recipe input to the current spec format:
 * - Converts legacy `modules` array (e.g., ["scaling@1"]) to `stacks` map (e.g., { scaling: 1 })
 * - Converts legacy `stacks` array format to map format
 * - Ensures `stacks` exists even if empty
 * - Preserves existing `stacks` map format
 * 
 * @param input - Raw recipe input (may have legacy formats)
 * @returns Normalized recipe with warnings for any issues encountered
 */
export function normalizeRecipe(input: unknown): NormalizationResult {
  if (!input || typeof input !== 'object') {
    throw new Error('Recipe input must be an object');
  }

  const recipe = JSON.parse(JSON.stringify(input)) as any;
  const warnings: string[] = [];

  // Normalize stacks from various legacy formats
  normalizeStacks(recipe, warnings);

  // Ensure stacks exists (even if empty)
  if (!recipe.stacks) {
    recipe.stacks = {};
  }

  return {
    recipe: recipe as Recipe,
    warnings,
  };
}

/**
 * Normalizes the stacks field from legacy formats to the map format.
 * Handles:
 * - Legacy `modules` array: ["scaling@1", "timed@1"] -> { scaling: 1, timed: 1 }
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

  // Collect module identifiers from various sources
  const moduleIdentifiers: string[] = [];

  // Check legacy modules array
  if (Array.isArray(recipe.modules)) {
    moduleIdentifiers.push(...recipe.modules.filter((m: any) => typeof m === 'string'));
  }

  // Check legacy stacks array (only if stacks wasn't already a map)
  if (Array.isArray(recipe.stacks)) {
    moduleIdentifiers.push(...recipe.stacks.filter((s: any) => typeof s === 'string'));
  }

  // Parse module identifiers into stacks map and merge with existing stacks
  for (const identifier of moduleIdentifiers) {
    const parsed = parseModuleIdentifier(identifier);
    if (parsed) {
      const { name, version } = parsed;
      // If the same module appears multiple times, keep the highest version
      if (!stacks[name] || stacks[name] < version) {
        stacks[name] = version;
      }
    } else {
      warnings.push(`Invalid module identifier '${identifier}': expected format 'name@version' (e.g., 'scaling@1')`);
    }
  }

  // Set the normalized stacks
  recipe.stacks = stacks;

  // Optionally remove legacy modules field after normalization
  // We keep it for now to maintain backward compatibility during transition
  // but it will be ignored in favor of stacks
}

/**
 * Parses a module identifier string like "scaling@1" into { name: "scaling", version: 1 }
 * Returns null if the format is invalid.
 */
function parseModuleIdentifier(identifier: string): { name: string; version: number } | null {
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

