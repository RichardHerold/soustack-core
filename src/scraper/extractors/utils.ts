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
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/7225c3b5-9ac2-4c94-b561-807ca9003b66',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scraper/extractors/utils.ts:14',message:'isRecipeNode check',data:{type,typeLower:typeof type==='string'?type.toLowerCase():Array.isArray(type)?type.map(t=>typeof t==='string'?t.toLowerCase():t):undefined,isMatch:typeof type==='string'?RECIPE_TYPES.has(type.toLowerCase()):Array.isArray(type)?type.some(e=>typeof e==='string'&&RECIPE_TYPES.has(e.toLowerCase())):false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

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
