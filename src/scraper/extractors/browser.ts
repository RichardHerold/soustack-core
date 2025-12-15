import type { ExtractionResult, SchemaOrgRecipe } from '../types';
import { isRecipeNode, safeJsonParse, normalizeText } from './utils';

type JsonLdPayload = Record<string, unknown> | Array<Record<string, unknown>>;

const SIMPLE_PROPS = ['name', 'description', 'image', 'recipeYield', 'prepTime', 'cookTime', 'totalTime'] as const;

export function extractRecipeBrowser(html: string): ExtractionResult {
  // Extract JSON-LD
  const jsonLdRecipe = extractJsonLdBrowser(html);
  if (jsonLdRecipe) {
    return { recipe: jsonLdRecipe, source: 'jsonld' };
  }

  // Extract Microdata
  const microdataRecipe = extractMicrodataBrowser(html);
  if (microdataRecipe) {
    return { recipe: microdataRecipe, source: 'microdata' };
  }

  return { recipe: null, source: null };
}

function extractJsonLdBrowser(html: string): SchemaOrgRecipe | null {
  if (typeof (globalThis as any).DOMParser === 'undefined') {
    return null;
  }

  const parser = new (globalThis as any).DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  const candidates: SchemaOrgRecipe[] = [];

  scripts.forEach((script: Element) => {
    const content = script.textContent;
    if (!content) return;

    const parsed = safeJsonParse<JsonLdPayload>(content);
    if (!parsed) return;

    collectCandidates(parsed, candidates);
  });

  return candidates[0] ?? null;
}

function extractMicrodataBrowser(html: string): SchemaOrgRecipe | null {
  if (typeof (globalThis as any).DOMParser === 'undefined') {
    return null;
  }

  const parser = new (globalThis as any).DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const recipeEl = doc.querySelector('[itemscope][itemtype*="schema.org/Recipe"]');

  if (!recipeEl) {
    return null;
  }

  const recipe: SchemaOrgRecipe = {
    '@type': 'Recipe'
  };

  SIMPLE_PROPS.forEach(prop => {
    const value = findPropertyValue(recipeEl, prop);
    if (value) {
      recipe[prop] = value;
    }
  });

  const ingredients: string[] = [];
  recipeEl.querySelectorAll('[itemprop="recipeIngredient"]').forEach((el: Element) => {
    const text = normalizeText(
      (el as any).getAttribute('content') || el.textContent || undefined
    );
    if (text) ingredients.push(text);
  });

  if (ingredients.length) {
    recipe.recipeIngredient = ingredients;
  }

  const instructions: string[] = [];
  recipeEl.querySelectorAll('[itemprop="recipeInstructions"]').forEach((el: Element) => {
    const text =
      normalizeText((el as any).getAttribute('content')) ||
      normalizeText(el.querySelector('[itemprop="text"]')?.textContent || undefined) ||
      normalizeText(el.textContent || undefined);
    if (text) instructions.push(text);
  });

  if (instructions.length) {
    recipe.recipeInstructions = instructions;
  }

  if (recipe.name || ingredients.length) {
    return recipe;
  }

  return null;
}

function findPropertyValue(context: Element, prop: string): string | undefined {
  const node = context.querySelector(`[itemprop="${prop}"]`);
  if (!node) return undefined;

  return (
    normalizeText((node as any).getAttribute('content')) ||
    normalizeText((node as any).getAttribute('href')) ||
    normalizeText((node as any).getAttribute('src')) ||
    normalizeText(node.textContent || undefined)
  );
}

function collectCandidates(payload: unknown, bucket: SchemaOrgRecipe[]) {
  if (!payload) return;

  if (Array.isArray(payload)) {
    payload.forEach(entry => collectCandidates(entry, bucket));
    return;
  }

  if (typeof payload !== 'object') {
    return;
  }

  if (isRecipeNode(payload)) {
    bucket.push(payload);
    return;
  }

  const graph = (payload as Record<string, unknown>)['@graph'];
  if (Array.isArray(graph)) {
    graph.forEach(entry => collectCandidates(entry, bucket));
  }
}

