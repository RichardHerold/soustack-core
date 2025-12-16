import {
  IngredientItem,
  Instruction,
  InstructionItem,
  Recipe,
  StructuredTime,
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
import modulesRegistry from '../schemas/registry/modules.json';

export function convertBasicMetadata(recipe: Recipe): Partial<SchemaOrgRecipe> {
  return cleanOutput({
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: recipe.name,
    description: recipe.description,
    image: recipe.image,
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

    if ('subsection' in ingredient) {
      ingredient.items.forEach(item => {
        if (!item) {
          return;
        }
        if (typeof item === 'string') {
          const value = item.trim();
          if (value) {
            result.push(value);
          }
        } else if (item.item) {
          const value = item.item.trim();
          if (value) {
            result.push(value);
          }
        }
      });
      return;
    }

    const value = ingredient.item?.trim();
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

  if ('subsection' in entry) {
    const steps = entry.items
      .map(item => convertInstruction(item))
      .filter((step): step is SchemaOrgInstruction => Boolean(step));

    if (!steps.length) {
      return null;
    }

    return {
      '@type': 'HowToSection',
      name: entry.subsection,
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

  if (entry.timing) {
    if (typeof entry.timing.duration === 'number') {
      step.performTime = formatDuration(entry.timing.duration);
    } else if (entry.timing.duration) {
      step.performTime = entry.timing.duration;
    }
  }

  if (entry.image) {
    step.image = entry.image;
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

  if (isStructuredTime(time)) {
    const result: Partial<SchemaOrgRecipe> = {};
    if (time.prep !== undefined) {
      result.prepTime = formatDuration(time.prep);
    }
    if (time.active !== undefined) {
      result.cookTime = formatDuration(time.active);
    }
    if (time.total !== undefined) {
      result.totalTime = formatDuration(time.total);
    }
    return result;
  }

  const result: Partial<SchemaOrgRecipe> = {};
  if (time.prepTime) {
    result.prepTime = time.prepTime;
  }
  if (time.cookTime) {
    result.cookTime = time.cookTime;
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

  return {
    ...nutrition,
    '@type': 'NutritionInformation'
  };
}

export function cleanOutput<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as T;
}

/**
 * Get schemaOrgMappable modules from the recipe's modules list.
 * Only modules that are marked as schemaOrgMappable in the registry are included.
 */
function getSchemaOrgMappableModules(modules: string[] = []): string[] {
  const mappableModules = modulesRegistry.modules
    .filter((m) => m.schemaOrgMappable)
    .map((m) => `${m.id}@${m.latest}`);
  
  return modules.filter((moduleId) => mappableModules.includes(moduleId));
}

/**
 * Convert a Soustack recipe to Schema.org JSON-LD format.
 * 
 * BREAKING CHANGE in v0.3.0: This function now targets the "minimal" profile
 * and only includes modules that are schemaOrgMappable (as defined in the
 * modules registry). Non-mappable modules (e.g., nutrition@1, schedule@1)
 * are excluded from the conversion.
 */
export function toSchemaOrg(recipe: Recipe): SchemaOrgRecipe {
  const base = convertBasicMetadata(recipe);
  const ingredients = convertIngredients(recipe.ingredients);
  const instructions = convertInstructions(recipe.instructions);
  
  // Only include nutrition if the nutrition module is schemaOrgMappable
  // (Currently nutrition@1 is NOT mappable, so this will be undefined)
  const recipeModules = Array.isArray(recipe.modules) ? recipe.modules : [];
  const mappableModules = getSchemaOrgMappableModules(recipeModules);
  const hasMappableNutrition = mappableModules.includes('nutrition@1');
  const nutrition = hasMappableNutrition ? convertNutrition(recipe.nutrition) : undefined;

  // Convert time if times module is mappable (times@1 is mappable)
  const hasMappableTimes = mappableModules.includes('times@1');
  const timeData = hasMappableTimes ? convertTime(recipe.time) : {};

  // Convert attribution if attribution module is mappable (attribution@1 is mappable)
  const hasMappableAttribution = mappableModules.includes('attribution@1');
  const attributionData = hasMappableAttribution ? convertAuthor(recipe.source) : {};

  // Convert taxonomy if taxonomy module is mappable (taxonomy@1 is mappable)
  const hasMappableTaxonomy = mappableModules.includes('taxonomy@1');
  const taxonomyData = hasMappableTaxonomy
    ? convertCategoryTags(recipe.category, recipe.tags)
    : {};

  return cleanOutput({
    ...base,
    recipeIngredient: ingredients.length ? ingredients : undefined,
    recipeInstructions: instructions.length ? instructions : undefined,
    recipeYield: convertYield(recipe.yield),
    ...timeData,
    ...attributionData,
    ...taxonomyData,
    nutrition
  }) as SchemaOrgRecipe;
}

function isStructuredTime(time: Time): time is StructuredTime {
  return (
    typeof (time as StructuredTime).prep !== 'undefined' ||
    typeof (time as StructuredTime).active !== 'undefined' ||
    typeof (time as StructuredTime).passive !== 'undefined' ||
    typeof (time as StructuredTime).total !== 'undefined'
  );
}
