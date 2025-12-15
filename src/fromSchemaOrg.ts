import {
  IngredientItem,
  Instruction,
  InstructionItem,
  Recipe,
  Source,
  StructuredTime
} from './types';
import { parseIngredientLine } from './converters/ingredient';
import { parseYield } from './converters/yield';
import { smartParseDuration } from './parsers/duration';
import {
  HowToSection,
  HowToStep,
  SchemaOrgImage,
  SchemaOrgPersonOrOrganization,
  SchemaOrgRecipe
} from './types/schemaOrg';

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
  const image = convertImage(recipeNode.image);
  const source = convertSource(recipeNode);
  const nutrition =
    recipeNode.nutrition && typeof recipeNode.nutrition === 'object'
      ? recipeNode.nutrition
      : undefined;

  return {
    name: recipeNode.name.trim(),
    description: recipeNode.description?.trim() || undefined,
    image,
    category,
    tags: tags.length ? tags : undefined,
    source,
    dateAdded: recipeNode.datePublished || undefined,
    dateModified: recipeNode.dateModified || undefined,
    yield: recipeYield,
    time,
    ingredients,
    instructions,
    nutrition
  };
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
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/7225c3b5-9ac2-4c94-b561-807ca9003b66',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'fromSchemaOrg.ts:95',message:'hasRecipeType check',data:{types,typesLower:types.map(t=>typeof t==='string'?t.toLowerCase():t),isMatch:types.some(e=>typeof e==='string'&&e.toLowerCase()==='recipe')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
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
    .map(line => parseIngredientLine(line));
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
          subsection: entry.name?.trim() || 'Section',
          items: subsectionItems
        });
      }
      continue;
    }

    if (isHowToStep(entry)) {
      const text = extractInstructionText(entry);
      if (text) {
        result.push(text);
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
      const text = extractInstructionText(item);
      if (text) {
        result.push(text);
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

function convertTime(recipe: SchemaOrgRecipe): StructuredTime | undefined {
  const prep = smartParseDuration(recipe.prepTime ?? '');
  const cook = smartParseDuration(recipe.cookTime ?? '');
  const total = smartParseDuration(recipe.totalTime ?? '');

  const structured: StructuredTime = {};
  if (prep !== null && prep !== undefined) structured.prep = prep;
  if (cook !== null && cook !== undefined) structured.active = cook;
  if (total !== null && total !== undefined) structured.total = total;

  return Object.keys(structured).length ? structured : undefined;
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

function convertImage(value: SchemaOrgImage | undefined): string | undefined {
  if (!value) return undefined;

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const url = typeof item === 'string' ? item : extractImageUrl(item);
      if (url) return url;
    }
    return undefined;
  }

  return extractImageUrl(value);
}

function extractImageUrl(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as { url?: unknown; contentUrl?: unknown };
  const candidate =
    typeof record.url === 'string'
      ? record.url
      : typeof record.contentUrl === 'string'
        ? record.contentUrl
        : undefined;
  return candidate?.trim() || undefined;
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