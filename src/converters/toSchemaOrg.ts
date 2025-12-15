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
import { HowToSection, HowToStep, SchemaOrgRecipe } from '../types/schemaOrg';

type SchemaOrgInstruction = HowToStep | HowToSection;

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
    return createHowToStep(entry);
  }

  if ('subsection' in entry) {
    const steps = entry.items
      .map(item => createHowToStep(item))
      .filter((step): step is HowToStep => Boolean(step));

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

function createHowToStep(entry: string | Instruction | undefined): HowToStep | null {
  if (!entry) return null;

  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    if (!trimmed) {
      return null;
    }
    return {
      '@type': 'HowToStep',
      text: trimmed
    };
  }

  const trimmed = entry.text?.trim();
  if (!trimmed) {
    return null;
  }

  const step: HowToStep = {
    '@type': 'HowToStep',
    text: trimmed
  };

  if (entry.image) {
    step.image = entry.image;
  }

  return step;
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

export function toSchemaOrg(recipe: Recipe): SchemaOrgRecipe {
  const base = convertBasicMetadata(recipe);
  const ingredients = convertIngredients(recipe.ingredients);
  const instructions = convertInstructions(recipe.instructions);
  const nutrition = convertNutrition(recipe.nutrition);

  return cleanOutput({
    ...base,
    recipeIngredient: ingredients.length ? ingredients : undefined,
    recipeInstructions: instructions.length ? instructions : undefined,
    recipeYield: convertYield(recipe.yield),
    ...convertTime(recipe.time),
    ...convertAuthor(recipe.source),
    ...convertCategoryTags(recipe.category, recipe.tags),
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
