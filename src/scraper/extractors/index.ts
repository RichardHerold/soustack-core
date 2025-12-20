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
  // #region agent log
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
    const ingestUrl = process.env.SOUSTACK_DEBUG_INGEST_URL;
    if (ingestUrl) {
      try {
        const globalFetch = typeof globalThis !== 'undefined' && typeof globalThis.fetch !== 'undefined' ? globalThis.fetch : null;
        if (globalFetch) {
          globalFetch(ingestUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scraper/extractors/index.ts:6',message:'JSON-LD extraction result',data:{hasJsonLd:!!jsonLdRecipe},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C,D'})}).catch(()=>{});
        }
      } catch {}
    }
  }
  // #endregion
  if (jsonLdRecipe) {
    return { recipe: jsonLdRecipe, source: 'jsonld' };
  }

  const microdataRecipe = extractMicrodata(html);
  // #region agent log
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
    const ingestUrl = process.env.SOUSTACK_DEBUG_INGEST_URL;
    if (ingestUrl) {
      try {
        const globalFetch = typeof globalThis !== 'undefined' && typeof globalThis.fetch !== 'undefined' ? globalThis.fetch : null;
        if (globalFetch) {
          globalFetch(ingestUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scraper/extractors/index.ts:12',message:'Microdata extraction result',data:{hasMicrodata:!!microdataRecipe},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        }
      } catch {}
    }
  }
  // #endregion
  if (microdataRecipe) {
    return { recipe: microdataRecipe, source: 'microdata' };
  }

  return { recipe: null, source: null };
}
