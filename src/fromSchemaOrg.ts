import {
  Ingredient,
  IngredientItem,
  Instruction,
  InstructionItem,
  Recipe,
  Source,
  NutritionFacts,
  StepTiming,
  Time
} from './types';
import { parseYield } from './converters/yield';
import { smartParseDuration } from './parsers/duration';
import {
  HowToSection,
  HowToStep,
  SchemaOrgPersonOrOrganization,
  SchemaOrgRecipe,
  SchemaOrgImage
} from './types/schemaOrg';
import { normalizeImage } from './utils/image';
import { normalizeRecipe } from './normalize';
import { withCanonicalSchema } from './schemaMetadata';

export function fromSchemaOrg(input: unknown): Recipe | null {
  const recipeNode = extractRecipeNode(input);
  if (!recipeNode) {
    return null;
  }

  const ingredients = convertIngredients(recipeNode.recipeIngredient);
  const instructions = convertInstructions(recipeNode.recipeInstructions);
  const time = convertTime(recipeNode);
  const recipeYield = parseYield(recipeNode.recipeYield);
  const tags = collectTags(recipeNode.recipeCuisine, recipeNode.keywords);
  const category = extractFirst(recipeNode.recipeCategory);
  const source = convertSource(recipeNode);
  const dateModified = recipeNode.dateModified || undefined;
  const nutrition = convertNutrition(recipeNode.nutrition);
  const images = toArray(normalizeImage(recipeNode.image));
  const videos = normalizeMediaList(recipeNode.video);
  const profile: Recipe['profile'] =
    recipeYield && time ? 'base' : 'lite';

  // Legacy stack conversions removed - attribution/taxonomy/media/times/nutrition stacks are no longer supported
  // Schema.org data is mapped to recipe properties directly
  const stacks: Record<string, number> = {};

  const rawRecipe = {
    '@type': 'Recipe',
    profile,
    stacks,
    name: recipeNode.name.trim(),
    description: recipeNode.description?.trim() || undefined,
    images: images.length ? images : undefined,
    videos: videos.length ? videos : undefined,
    category,
    tags: tags.length ? tags : undefined,
    source,
    dateAdded: recipeNode.datePublished || undefined,
    yield: recipeYield,
    time,
    ingredients,
    instructions,
    ...(dateModified ? { dateModified } : {}),
    ...(nutrition ? { nutrition } : {})
  };

  // Normalize the recipe to ensure it's in the correct format
  const { recipe } = normalizeRecipe(rawRecipe);
  
  return withCanonicalSchema(recipe as Recipe);
}

function extractRecipeNode(input: unknown): SchemaOrgRecipe | null {
  if (!input) return null;

  if (Array.isArray(input)) {
    for (const entry of input) {
      const found = extractRecipeNode(entry);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (typeof input !== 'object') {
    return null;
  }

  const record = input as Partial<SchemaOrgRecipe> & { [key: string]: unknown };

  if (record['@graph']) {
    const fromGraph = extractRecipeNode(record['@graph']);
    if (fromGraph) {
      return fromGraph;
    }
  }

  if (!hasRecipeType(record['@type'])) {
    return null;
  }

  if (!isValidName(record.name)) {
    return null;
  }

  return record as SchemaOrgRecipe;
}

function hasRecipeType(value: SchemaOrgRecipe['@type']): boolean {
  if (!value) return false;
  const types = Array.isArray(value) ? value : [value];
  return types.some(
    entry => typeof entry === 'string' && entry.toLowerCase() === 'recipe'
  );
}

function isValidName(name: unknown): name is string {
  return typeof name === 'string' && Boolean(name.trim());
}

function convertIngredients(
  value: SchemaOrgRecipe['recipeIngredient']
): IngredientItem[] {
  if (!value) return [];
  const normalized = Array.isArray(value) ? value : [value];
  return normalized
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .map<Ingredient>(name => ({
      name,
      scaling: { mode: 'linear' }
    }));
}

function convertInstructions(
  value: SchemaOrgRecipe['recipeInstructions']
): InstructionItem[] {
  if (!value) return [];
  const normalized = Array.isArray(value) ? value : [value];
  const result: InstructionItem[] = [];

  for (const entry of normalized) {
    if (!entry) continue;

    if (typeof entry === 'string') {
      const text = entry.trim();
      if (text) {
        result.push(text);
      }
      continue;
    }

    if (isHowToSection(entry)) {
      const subsectionItems = extractSectionItems(entry.itemListElement);
      if (subsectionItems.length) {
        result.push({
          section: entry.name?.trim() || 'Section',
          steps: subsectionItems
        });
      }
      continue;
    }

    if (isHowToStep(entry)) {
      const parsed = convertHowToStep(entry);
      if (parsed) {
        result.push(parsed);
      }
    }
  }

  return result;
}

function extractSectionItems(
  items: Array<string | HowToStep | HowToSection> = []
): Array<string | Instruction> {
  const result: Array<string | Instruction> = [];

  for (const item of items) {
    if (!item) continue;

    if (typeof item === 'string') {
      const text = item.trim();
      if (text) {
        result.push(text);
      }
      continue;
    }

    if (isHowToStep(item)) {
      const parsed = convertHowToStep(item);
      if (parsed) {
        result.push(parsed);
      }
      continue;
    }

    if (isHowToSection(item)) {
      result.push(...extractSectionItems(item.itemListElement));
    }
  }

  return result;
}

function extractInstructionText(value: HowToStep): string | undefined {
  const text = typeof value.text === 'string' ? value.text : value.name;
  return typeof text === 'string' ? text.trim() || undefined : undefined;
}

function convertHowToStep(step: HowToStep): string | Instruction | undefined {
  const text = extractInstructionText(step);
  if (!text) {
    return undefined;
  }

  const normalizedImage = normalizeImage(step.image);
  const image = Array.isArray(normalizedImage)
    ? normalizedImage[0]
    : normalizedImage;
  const id = extractInstructionId(step);
  const timing = extractInstructionTiming(step);

  if (!image && !id && !timing) {
    return text;
  }

  const instruction: Instruction = { text };
  if (id) instruction.id = id;
  if (image) instruction.images = Array.isArray(image) ? image : [image];
  if (timing) instruction.timing = timing;

  return instruction;
}

function extractInstructionTiming(step: HowToStep): StepTiming | undefined {
  const duration =
    step.totalTime || step.performTime || step.prepTime || (step as any).duration;

  if (!duration || typeof duration !== 'string') {
    return undefined;
  }

  const parsed = smartParseDuration(duration);
  if (parsed === null || parsed === undefined) {
    return undefined;
  }
  
  return {
    activity: 'active',
    duration: { minutes: parsed }
  };
}

function extractInstructionId(step: HowToStep): string | undefined {
  const raw = (step as any)['@id'] || (step as any).id || step.url;
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed || undefined;
}

function isHowToStep(value: unknown): value is HowToStep {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as HowToStep)['@type'] === 'HowToStep'
  );
}

function isHowToSection(value: unknown): value is HowToSection {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as HowToSection)['@type'] === 'HowToSection' &&
    Array.isArray((value as HowToSection).itemListElement)
  );
}

function convertTime(recipe: SchemaOrgRecipe): Time | undefined {
  const total = smartParseDuration(recipe.totalTime ?? '');
  const prep = smartParseDuration(recipe.prepTime ?? '');
  const cook = smartParseDuration(recipe.cookTime ?? '');

  const minutes = isPositiveDuration(total)
    ? total
    : [prep, cook].filter(isPositiveDuration).reduce<number | null>((sum, value) => {
        if (sum === null) return value;
        return sum + value;
      }, null);

  if (!isPositiveDuration(minutes)) {
    return undefined;
  }

  return {
    total: { minutes }
  };
}

function isPositiveDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function collectTags(cuisine: unknown, keywords: unknown): string[] {
  const tags = new Set<string>();
  flattenStrings(cuisine).forEach(tag => tags.add(tag));
  if (typeof keywords === 'string') {
    splitKeywords(keywords).forEach(tag => tags.add(tag));
  } else {
    flattenStrings(keywords).forEach(tag => tags.add(tag));
  }
  return Array.from(tags);
}

function splitKeywords(value: string): string[] {
  return value
    .split(/[,|]/)
    .map(part => part.trim())
    .filter(Boolean);
}

function flattenStrings(value: unknown): string[] {
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
  const arr = flattenStrings(value);
  return arr.length ? arr[0] : undefined;
}

function convertSource(recipe: SchemaOrgRecipe): Source | undefined {
  const author = extractEntityName(recipe.author);
  const publisher = extractEntityName(recipe.publisher);
  const url = (recipe.url || recipe.mainEntityOfPage)?.trim();

  const source: Source = {};
  if (author) source.author = author;
  if (publisher) source.name = publisher;
  if (url) source.url = url;

  return Object.keys(source).length ? source : undefined;
}

function extractEntityName(
  value:
    | SchemaOrgPersonOrOrganization
    | SchemaOrgPersonOrOrganization[]
    | string
    | string[]
    | undefined
): string | undefined {
  if (!value) return undefined;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const name = extractEntityName(entry as any);
      if (name) {
        return name;
      }
    }
    return undefined;
  }

  if (typeof value === 'object' && typeof value.name === 'string') {
    const trimmed = value.name.trim();
    return trimmed || undefined;
  }

  return undefined;
}

// Legacy stack conversion functions removed - attribution/taxonomy stacks are no longer supported

function normalizeMediaList(value: SchemaOrgImage | undefined): string[] {
  if (!value) return [];
  if (typeof value === 'string') return [value.trim()].filter(Boolean);
  if (Array.isArray(value)) {
    return value
      .map(item => (typeof item === 'string' ? item.trim() : extractMediaUrl(item)))
      .filter((entry): entry is string => Boolean(entry?.length));
  }

  const url = extractMediaUrl(value);
  return url ? [url] : [];
}

function extractMediaUrl(value: unknown): string | undefined {
  if (value && typeof value === 'object') {
    const urlValue =
      typeof (value as any).url === 'string'
        ? (value as any).url
        : typeof (value as any).contentUrl === 'string'
          ? (value as any).contentUrl
          : undefined;

    if (typeof urlValue === 'string') {
      const trimmed = urlValue.trim();
      return trimmed || undefined;
    }
  }
  return undefined;
}

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

// Legacy stack conversion functions removed - media/times stacks are no longer supported
// Media is handled via image property, time via time property

function convertNutrition(
  nutrition: SchemaOrgRecipe['nutrition']
): NutritionFacts | undefined {
  if (!nutrition || typeof nutrition !== 'object') {
    return undefined;
  }

  const result: NutritionFacts = {};
  let hasData = false;

  // Parse calories - can be string or number in Schema.org
  if ('calories' in nutrition) {
    const calories = nutrition.calories;
    if (typeof calories === 'number') {
      result.calories = calories;
      hasData = true;
    } else if (typeof calories === 'string') {
      // Try to parse string like "200 cal" or "200"
      const parsed = parseFloat(calories.replace(/[^\d.-]/g, ''));
      if (!isNaN(parsed)) {
        result.calories = parsed;
        hasData = true;
      }
    }
  }

  // Parse protein - Schema.org uses "proteinContent", we need "protein_g"
  if ('proteinContent' in nutrition || 'protein_g' in nutrition) {
    const protein = nutrition.proteinContent || nutrition.protein_g;
    if (typeof protein === 'number') {
      result.protein_g = protein;
      hasData = true;
    } else if (typeof protein === 'string') {
      // Try to parse string like "10 g" or "10"
      const parsed = parseFloat(protein.replace(/[^\d.-]/g, ''));
      if (!isNaN(parsed)) {
        result.protein_g = parsed;
        hasData = true;
      }
    }
  }

  return hasData ? result : undefined;
}
