import type { SchemaOrgRecipe } from '../types';

const RECIPE_TYPES = new Set([
  'recipe',
  'https://schema.org/recipe',
  'http://schema.org/recipe'
]);

export function isRecipeNode(value: unknown): value is SchemaOrgRecipe {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const type = (value as Record<string, unknown>)['@type'];

  if (typeof type === 'string') {
    return RECIPE_TYPES.has(type.toLowerCase());
  }

  if (Array.isArray(type)) {
    return type.some(
      entry => typeof entry === 'string' && RECIPE_TYPES.has(entry.toLowerCase())
    );
  }

  return false;
}

export function safeJsonParse<T = unknown>(content: string): T | null {
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export function normalizeText(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed || undefined;
}
