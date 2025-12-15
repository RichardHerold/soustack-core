import type { ExtractionResult } from '../types';
import { extractJsonLd } from './jsonld';
import { extractMicrodata } from './microdata';
import { extractRecipeBrowser } from './browser';

function isBrowser(): boolean {
  try {
    // Check if we're in a browser environment with DOMParser
    return typeof (globalThis as any).DOMParser !== 'undefined';
  } catch {
    return false;
  }
}

export function extractRecipe(html: string): ExtractionResult {
  // Use browser-compatible extraction if DOMParser is available
  if (isBrowser()) {
    return extractRecipeBrowser(html);
  }
  
  // Fallback to cheerio-based extraction for Node.js
  const jsonLdRecipe = extractJsonLd(html);
  if (jsonLdRecipe) {
    return { recipe: jsonLdRecipe, source: 'jsonld' };
  }

  const microdataRecipe = extractMicrodata(html);
  if (microdataRecipe) {
    return { recipe: microdataRecipe, source: 'microdata' };
  }

  return { recipe: null, source: null };
}
