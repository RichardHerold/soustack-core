import {
  Ingredient,
  IngredientItem,
  Instruction,
  InstructionItem,
  Recipe,
  StructuredTime,
  Time
} from './types';
import { formatDuration } from './parsers/duration';
import { formatYield } from './converters/yield';

type SchemaOrgInstruction =
  | string
  | {
      '@type': 'HowToStep';
      text: string;
    };

export function toSchemaOrg(recipe: Recipe): Record<string, unknown> {
  const ingredientStrings = flattenIngredients(recipe.ingredients).map(
    materializeIngredient
  );
  const instructionObjects = flattenInstructions(
    recipe.instructions
  ).map<SchemaOrgInstruction>(instruction => ({
    '@type': 'HowToStep',
    text: instruction.text
  }));

  const schemaOrg: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: recipe.name,
    description: recipe.description,
    image: recipe.image,
    recipeIngredient: ingredientStrings,
    recipeInstructions: instructionObjects,
    recipeYield: formatYield(recipe.yield),
    prepTime: extractPrepTime(recipe.time),
    cookTime: extractCookTime(recipe.time),
    totalTime: extractTotalTime(recipe.time),
    recipeCategory: recipe.category,
    keywords: recipe.tags?.join(', '),
    recipeCuisine: recipe.tags?.length ? recipe.tags[0] : undefined,
    author: recipe.source?.author,
    publisher: recipe.source?.name
      ? {
          '@type': 'Organization',
          name: recipe.source.name,
          ...(recipe.source.url ? { url: recipe.source.url } : {})
        }
      : undefined,
    mainEntityOfPage: recipe.source?.url,
    nutrition: recipe.nutrition
  };

  // Remove undefined values for cleaner JSON-LD
  Object.keys(schemaOrg).forEach(key => {
    if (schemaOrg[key] === undefined || schemaOrg[key] === null) {
      delete schemaOrg[key];
    }
  });

  return schemaOrg;
}

function flattenIngredients(items: IngredientItem[]): Ingredient[] {
  return items.flatMap(item => {
    if (typeof item === 'string') {
      return [{ item, name: item, scaling: { type: 'linear' } }];
    }
    if ('subsection' in item) {
      return flattenIngredients(item.items as IngredientItem[]);
    }
    return [item];
  });
}

function materializeIngredient(ingredient: Ingredient): string {
  if (ingredient.item) {
    return ingredient.item;
  }

  const segments = [];
  if (ingredient.quantity?.amount) {
    segments.push(formatNumber(ingredient.quantity.amount));
  }
  if (ingredient.quantity?.unit) {
    segments.push(ingredient.quantity.unit);
  }
  if (ingredient.name) {
    segments.push(ingredient.name);
  }

  let line = segments.join(' ').trim();
  if (ingredient.prep) {
    line = `${line}, ${ingredient.prep}`;
  }
  if (ingredient.notes) {
    line = `${line} (${ingredient.notes})`;
  }
  if (ingredient.optional) {
    line = `${line} (optional)`;
  }

  return line || ingredient.item || '';
}

function flattenInstructions(items: InstructionItem[] = []): Instruction[] {
  return items.flatMap(item => {
    if (typeof item === 'string') {
      return [{ text: item }];
    }
    if ('subsection' in item) {
      return flattenInstructions(item.items as InstructionItem[]);
    }
    return [item];
  });
}

function extractPrepTime(time?: Time): string | undefined {
  if (!time) return undefined;
  if (isStructuredTime(time)) {
    return maybeFormatDuration(time.prep);
  }
  return time.prepTime;
}

function extractCookTime(time?: Time): string | undefined {
  if (!time) return undefined;
  if (isStructuredTime(time)) {
    return maybeFormatDuration(time.active);
  }
  return time.cookTime;
}

function extractTotalTime(time?: Time): string | undefined {
  if (!time) return undefined;
  if (isStructuredTime(time)) {
    return maybeFormatDuration(time.total);
  }
  return undefined;
}

function isStructuredTime(time: Time): time is StructuredTime {
  return 'prep' in (time as StructuredTime) || 'active' in (time as StructuredTime);
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return Number(value.toFixed(2)).toString();
}

function maybeFormatDuration(value: number | undefined): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return formatDuration(value);
}
