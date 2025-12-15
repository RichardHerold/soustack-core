import type { ExtractionResult } from '../types';
import { extractJsonLd } from './jsonld';
import { extractMicrodata } from './microdata';

export function extractRecipe(html: string): ExtractionResult {
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
