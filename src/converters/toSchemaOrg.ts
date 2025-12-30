import {
  IngredientItem,
  Instruction,
  InstructionItem,
  Recipe,
  Time
} from '../types';
import { formatDuration } from '../parsers/duration';
import { formatYield } from './yield';
import {
  HowToSection,
  HowToStep,
  SchemaOrgInstruction,
  SchemaOrgRecipe
} from '../types/schemaOrg';
import stacksRegistry from '../stacks/registry.json';
import { withCanonicalSchema } from '../schemaMetadata';

export function convertBasicMetadata(recipe: Recipe): Partial<SchemaOrgRecipe> {
  const image = toSchemaOrgMedia(recipe.images ?? (recipe as any).image);
  const video = toSchemaOrgMedia(recipe.videos);

  return cleanOutput({
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: recipe.name,
    description: recipe.description,
    image,
    video,
    url: recipe.source?.url,
    datePublished: recipe.dateAdded,
    dateModified: recipe.dateModified
  });
}

export function convertIngredients(ingredients: IngredientItem[] = []): string[] {
  const result: string[] = [];

  ingredients.forEach(ingredient => {
    if (!ingredient) {
      return;
    }

    if (typeof ingredient === 'string') {
      const value = ingredient.trim();
      if (value) {
        result.push(value);
      }
      return;
    }

    if ('section' in ingredient) {
      ingredient.ingredients.forEach((item: IngredientItem) => {
        if (!item) {
          return;
        }
        if (typeof item === 'string') {
          const value = item.trim();
          if (value) {
            result.push(value);
          }
        } else if ('name' in item && item.name) {
          const value = item.name.trim();
          if (value) {
            result.push(value);
          }
        }
      });
      return;
    }

    const value = 'name' in ingredient ? ingredient.name?.trim() : undefined;
    if (value) {
      result.push(value);
    }
  });

  return result;
}

export function convertInstructions(
  instructions: InstructionItem[] = []
): SchemaOrgInstruction[] {
  return instructions
    .map(entry => convertInstruction(entry))
    .filter((value): value is SchemaOrgInstruction => Boolean(value));
}

function convertInstruction(entry: InstructionItem): SchemaOrgInstruction | null {
  if (!entry) {
    return null;
  }

  if (typeof entry === 'string') {
    const value = entry.trim();
    return value || null;
  }

  if ('section' in entry) {
    const steps = entry.steps
      .map((item: InstructionItem) => convertInstruction(item))
      .filter((step): step is SchemaOrgInstruction => Boolean(step));

    if (!steps.length) {
      return null;
    }

    return {
      '@type': 'HowToSection',
      name: entry.section,
      itemListElement: steps
    };
  }

  if ('text' in entry) {
    return createHowToStep(entry);
  }

  return createHowToStep(String(entry));
}

function createHowToStep(
  entry: string | Instruction | undefined
): SchemaOrgInstruction | null {
  if (!entry) return null;

  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    return trimmed || null;
  }

  const trimmed = entry.text?.trim();
  if (!trimmed) {
    return null;
  }

  const step: HowToStep = {
    '@type': 'HowToStep',
    text: trimmed
  };

  if (entry.id) {
    step['@id'] = entry.id;
  }

  if (entry.timing?.duration) {
    const duration = entry.timing.duration;
    if (typeof duration === 'object' && 'minutes' in duration) {
      step.performTime = formatDuration(duration.minutes);
    } else if (typeof duration === 'number') {
      step.performTime = formatDuration(duration);
    }
  }

  if (entry.images && entry.images.length > 0) {
    step.image = entry.images[0]; // Use first image for Schema.org
  }

  if (step['@id'] || step.performTime || step.image) {
    return step;
  }

  return trimmed;
}

export function convertTime(time?: Time): Partial<SchemaOrgRecipe> {
  if (!time) {
    return {};
  }

  // Time format: { total: { minutes: number } }
  const result: Partial<SchemaOrgRecipe> = {};
  if (time.total && typeof time.total === 'object' && 'minutes' in time.total) {
    result.totalTime = formatDuration(time.total.minutes);
  }
  return result;
}

export function convertYield(yld?: Recipe['yield']): string | undefined {
  if (!yld) {
    return undefined;
  }
  return formatYield(yld);
}

export function convertAuthor(
  source?: Recipe['source']
): Partial<SchemaOrgRecipe> {
  if (!source) {
    return {};
  }

  const result: Partial<SchemaOrgRecipe> = {};

  if (source.author) {
    result.author = {
      '@type': 'Person',
      name: source.author
    };
  }

  if (source.name) {
    result.publisher = {
      '@type': 'Organization',
      name: source.name
    };
  }

  if (source.url) {
    result.url = source.url;
  }

  return result;
}

export function convertCategoryTags(
  category?: string,
  tags?: string[]
): Partial<SchemaOrgRecipe> {
  const result: Partial<SchemaOrgRecipe> = {};

  if (category) {
    result.recipeCategory = category;
  }

  if (tags && tags.length > 0) {
    result.keywords = tags.filter(Boolean).join(', ');
  }

  return result;
}

export function convertNutrition(
  nutrition?: Recipe['nutrition']
): SchemaOrgRecipe['nutrition'] {
  if (!nutrition) {
    return undefined;
  }

  const result: SchemaOrgRecipe['nutrition'] = {
    '@type': 'NutritionInformation'
  };

  // Convert numeric calories to Schema.org string format
  if (nutrition.calories !== undefined) {
    if (typeof nutrition.calories === 'number') {
      result.calories = `${nutrition.calories} calories`;
    } else {
      result.calories = nutrition.calories;
    }
  }

  // Preserve other nutrition fields as-is (excluding @type which we override)
  Object.keys(nutrition).forEach(key => {
    if (key !== 'calories' && key !== '@type') {
      (result as any)[key] = (nutrition as any)[key];
    }
  });

  return result;
}

function toSchemaOrgMedia(
  media?: string | string[] | null
): string | string[] | undefined {
  if (!media) {
    return undefined;
  }

  const list = Array.isArray(media) ? media.filter(Boolean) : [media];
  if (list.length === 0) {
    return undefined;
  }

  return list.length === 1 ? list[0] : list;
}

export function cleanOutput<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as T;
}

/**
 * Get schemaOrgMappable stacks from the recipe's stacks map.
 * Only stacks that are marked as schemaOrgMappable in the registry are included.
 * Returns a set of stack identifiers (e.g., ["attribution@1", "times@1"]).
 */
function getSchemaOrgMappableStacks(stacks: Record<string, number> = {}): Set<string> {
  const mappableStackIds = new Set<string>();
  
  // The new registry structure doesn't have schemaOrgMappable field
  // Use a hardcoded list of stacks that have Schema.org equivalents
  // These correspond to Schema.org Recipe properties
  const mappableStackNames = new Set([
    // Note: Old stack names that may still be in use
    'attribution', // maps to author/publisher
    'taxonomy',   // maps to recipeCategory/keywords
    // Legacy times stack removed - time is now a base property
    // New stack names (if they map to Schema.org)
    // Add new mappable stacks here as they're identified
  ]);

  // Check which stacks in the recipe are mappable
  for (const [name, version] of Object.entries(stacks)) {
    if (mappableStackNames.has(name) && typeof version === "number" && version >= 1) {
      mappableStackIds.add(`${name}@${version}`);
    }
  }
  
  return mappableStackIds;
}

/**
 * Convert a Soustack recipe to Schema.org JSON-LD format.
 * 
 * BREAKING CHANGE in v0.0.2: This function now targets the "minimal" profile
 * and only includes stacks that are schemaOrgMappable (as defined in the
 * stacks registry). Non-mappable stacks (e.g., nutrition@1, schedule@1)
 * are excluded from the conversion.
 */
export function toSchemaOrg(recipe: Recipe): SchemaOrgRecipe {
  const base = convertBasicMetadata(recipe);
  const ingredients = convertIngredients(recipe.ingredients);
  const instructions = convertInstructions(recipe.instructions);
  
  // Get mappable stacks from recipe.stacks
  const recipeStacks = (recipe.stacks && typeof recipe.stacks === 'object' && !Array.isArray(recipe.stacks))
    ? recipe.stacks
    : {};
  const mappableStacks = getSchemaOrgMappableStacks(recipeStacks);
  
  // Only include nutrition if the nutrition stack is schemaOrgMappable
  // (Currently nutrition@1 is NOT mappable, so this will be undefined)
  const hasMappableNutrition = mappableStacks.has('nutrition@1');
  const nutrition = hasMappableNutrition ? convertNutrition(recipe.nutrition) : undefined;

  // Convert time - uses recipe.time (Time format)
  const timeData = convertTime(recipe.time);

  // Convert attribution if attribution stack is mappable (attribution@1 is mappable)
  const hasMappableAttribution = mappableStacks.has('attribution@1');
  const attributionData = hasMappableAttribution ? convertAuthor(recipe.source) : {};

  // Convert taxonomy if taxonomy stack is mappable (taxonomy@1 is mappable)
  const hasMappableTaxonomy = mappableStacks.has('taxonomy@1');
  const taxonomyData = hasMappableTaxonomy
    ? convertCategoryTags(recipe.category, recipe.tags)
    : {};

  const schemaOrgRecipe = cleanOutput({
    ...base,
    recipeIngredient: ingredients.length ? ingredients : undefined,
    recipeInstructions: instructions.length ? instructions : undefined,
    recipeYield: convertYield(recipe.yield),
    ...timeData,
    ...attributionData,
    ...taxonomyData,
    nutrition
  }) as SchemaOrgRecipe;

  return withCanonicalSchema(schemaOrgRecipe) as SchemaOrgRecipe;
}

// Legacy isStructuredTime removed - uses Time format with DurationMinutes
