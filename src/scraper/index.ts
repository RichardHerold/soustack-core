import { fromSchemaOrg } from '../fromSchemaOrg';
import type { Recipe } from '../types';
import { fetchPage } from './fetch';
import { extractRecipe } from './extractors';
import type { ScrapeRecipeOptions } from './types';

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
