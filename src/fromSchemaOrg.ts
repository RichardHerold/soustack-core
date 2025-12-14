import { z } from 'zod';
import {
  Ingredient,
  IngredientItem,
  Instruction,
  InstructionItem,
  Recipe,
  Source,
  StructuredTime
} from './types';
import { parseIngredientLine } from './converters/ingredient';
import { parseISODuration } from './converters/duration';
import { parseYield } from './converters/yield';

const SchemaOrgRecipe = z
  .object({
    name: z.string().min(1, 'Recipe name is required'),
    description: z.string().optional(),
    image: z.any().optional(),
    recipeIngredient: z.any().optional(),
    recipeInstructions: z.any().optional(),
    recipeYield: z.any().optional(),
    prepTime: z.string().optional(),
    cookTime: z.string().optional(),
    totalTime: z.string().optional(),
    recipeCategory: z.any().optional(),
    recipeCuisine: z.any().optional(),
    keywords: z.any().optional(),
    author: z.any().optional(),
    publisher: z.any().optional(),
    mainEntityOfPage: z.any().optional(),
    url: z.string().optional(),
    nutrition: z.any().optional()
  })
  .passthrough();

type SchemaOrgRecipeType = z.infer<typeof SchemaOrgRecipe>;

export function fromSchemaOrg(input: unknown): Recipe {
  const schemaOrg = SchemaOrgRecipe.parse(input);

  const ingredients = parseIngredients(schemaOrg.recipeIngredient);
  const instructions = parseInstructions(schemaOrg.recipeInstructions);
  const time = buildTimeObject(schemaOrg);
  const recipeYield = parseYield(schemaOrg.recipeYield);
  const tags = collectTags(schemaOrg.recipeCuisine, schemaOrg.keywords);
  const category = extractFirst(schemaOrg.recipeCategory);
  const image = normalizeImage(schemaOrg.image);
  const source = buildSource(schemaOrg);
  const nutrition =
    schemaOrg.nutrition && typeof schemaOrg.nutrition === 'object'
      ? schemaOrg.nutrition
      : undefined;

  return {
    name: schemaOrg.name,
    description: schemaOrg.description,
    image,
    category,
    tags: tags.length ? tags : undefined,
    source,
    yield: recipeYield,
    time,
    ingredients,
    instructions,
    nutrition
  };
}

function parseIngredients(value: unknown): IngredientItem[] {
  if (!value) return [];
  const normalized = Array.isArray(value) ? value : [value];
  return normalized
    .map(item => {
      if (typeof item === 'string') {
        return parseIngredientLine(item);
      }
      if (item && typeof item === 'object') {
        const maybeText =
          (item as any).text ||
          (item as any).name ||
          (item as any).description;
        if (typeof maybeText === 'string') {
          return parseIngredientLine(maybeText);
        }
      }
      return undefined;
    })
    .filter((ing): ing is Ingredient => Boolean(ing));
}

function parseInstructions(value: unknown): InstructionItem[] {
  if (!value) return [];
  if (typeof value === 'string') {
    return [{ text: value }];
  }
  if (Array.isArray(value)) {
    return value.flatMap(item => normalizeInstruction(item));
  }
  return normalizeInstruction(value);
}

function normalizeInstruction(item: unknown): InstructionItem[] {
  if (!item) return [];
  if (typeof item === 'string') {
    return [{ text: item }];
  }

  const typed = item as Record<string, any>;

  if (Array.isArray(typed.itemListElement)) {
    return typed.itemListElement.flatMap(child => normalizeInstruction(child));
  }

  const text =
    typed.text || typed.name || typed.description || typed['@type'] || '';
  if (!text) return [];

  const instruction: Instruction = {
    text: text.trim(),
    ...(Array.isArray(typed.dependsOn)
      ? { dependsOn: typed.dependsOn.filter(Boolean) }
      : {})
  };

  return [instruction];
}

function buildTimeObject(recipe: SchemaOrgRecipeType): StructuredTime | undefined {
  const prep = parseISODuration(recipe.prepTime);
  const cook = parseISODuration(recipe.cookTime);
  const total = parseISODuration(recipe.totalTime);

  if (!prep && !cook && !total) {
    return undefined;
  }

  const structured: StructuredTime = {};
  if (prep) structured.prep = prep;
  if (cook) structured.active = cook;
  if (total) structured.total = total;
  return structured;
}

function collectTags(cuisine: unknown, keywords: unknown): string[] {
  const tags = new Set<string>();
  flattenToArray(cuisine).forEach(item => {
    if (item) tags.add(item);
  });

  if (typeof keywords === 'string') {
    keywords
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
      .forEach(part => tags.add(part));
  } else {
    flattenToArray(keywords).forEach(item => {
      if (item) tags.add(item);
    });
  }

  return Array.from(tags);
}

function flattenToArray(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === 'string') return [value.trim()].filter(Boolean);
  if (Array.isArray(value)) {
    return value
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }
  return [];
}

function extractFirst(value: unknown): string | undefined {
  const arr = flattenToArray(value);
  return arr.length ? arr[0] : undefined;
}

function normalizeImage(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first = value.find(item => typeof item === 'string');
    if (first) return first;
  }
  if (typeof value === 'object' && 'url' in (value as Record<string, any>)) {
    const url = (value as Record<string, any>).url;
    if (typeof url === 'string') return url;
  }
  return undefined;
}

function buildSource(recipe: SchemaOrgRecipeType): Source | undefined {
  const author = extractEntityName(recipe.author);
  const publisher = extractEntityName(recipe.publisher);
  const url = typeof recipe.mainEntityOfPage === 'string'
    ? recipe.mainEntityOfPage
    : recipe.url;

  if (!author && !publisher && !url) {
    return undefined;
  }

  return {
    author: author || undefined,
    name: publisher || undefined,
    url: url || undefined
  };
}

function extractEntityName(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first = value.find(item => typeof item === 'string' || isObjectWithName(item));
    if (typeof first === 'string') return first;
    if (first && isObjectWithName(first)) return first.name;
  }
  if (isObjectWithName(value)) {
    return value.name;
  }
  return undefined;
}

function isObjectWithName(value: unknown): value is { name: string } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'name' in (value as Record<string, unknown>) &&
      typeof (value as Record<string, unknown>).name === 'string'
  );
}
