import { fromSchemaOrg } from '../fromSchemaOrg';
import type { Recipe } from '../types';
import { fetchPage } from './fetch';
import { extractRecipe } from './extractors';
import type { ScrapeRecipeOptions } from './types';

/**
 * Scrapes a recipe from a URL (Node.js only).
 * 
 * ⚠️ Not available in browser environments due to CORS restrictions.
 * For browser usage, fetch the HTML yourself and use extractRecipeFromHTML().
 * 
 * @param url - The URL of the recipe page to scrape
 * @param options - Fetch options (timeout, userAgent, maxRetries)
 * @returns A Soustack recipe object
 * @throws Error if no recipe is found
 */
export async function scrapeRecipe(url: string, options: ScrapeRecipeOptions = {}): Promise<Recipe> {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/7225c3b5-9ac2-4c94-b561-807ca9003b66',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scraper/index.ts:7',message:'scrapeRecipe entry',data:{url,hasOptions:!!options},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D,E'})}).catch(()=>{});
  // #endregion
  const html = await fetchPage(url, options);
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/7225c3b5-9ac2-4c94-b561-807ca9003b66',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scraper/index.ts:9',message:'HTML fetched',data:{htmlLength:html?.length,htmlPreview:html?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  const { recipe } = extractRecipe(html);
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/7225c3b5-9ac2-4c94-b561-807ca9003b66',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scraper/index.ts:11',message:'extractRecipe result',data:{hasRecipe:!!recipe,recipeType:recipe?.['@type'],recipeName:recipe?.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,C,D'})}).catch(()=>{});
  // #endregion

  if (!recipe) {
    throw new Error('No Schema.org recipe data found in page');
  }

  const soustackRecipe = fromSchemaOrg(recipe);
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/7225c3b5-9ac2-4c94-b561-807ca9003b66',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scraper/index.ts:17',message:'fromSchemaOrg result',data:{hasSoustackRecipe:!!soustackRecipe,soustackRecipeName:soustackRecipe?.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  if (!soustackRecipe) {
    throw new Error('Schema.org data did not include a valid recipe');
  }

  return soustackRecipe;
}

/**
 * Extracts a recipe from HTML string (browser and Node.js compatible).
 * 
 * This function works in both environments and doesn't require network access.
 * Perfect for browser usage where you fetch HTML yourself (with cookies/session).
 * 
 * @example
 * ```ts
 * // In browser:
 * const response = await fetch('https://example.com/recipe');
 * const html = await response.text();
 * const recipe = extractRecipeFromHTML(html);
 * ```
 * 
 * @param html - The HTML string containing Schema.org recipe data
 * @returns A Soustack recipe object
 * @throws Error if no recipe is found
 */
export function extractRecipeFromHTML(html: string): Recipe {
  const { recipe } = extractRecipe(html);

  if (!recipe) {
    throw new Error('No Schema.org recipe data found in HTML');
  }

  const soustackRecipe = fromSchemaOrg(recipe);
  if (!soustackRecipe) {
    throw new Error('Schema.org data did not include a valid recipe');
  }

  return soustackRecipe;
}
