import { fromSchemaOrg } from '../fromSchemaOrg';
import type { Recipe } from '../types';
import { fetchPage } from './fetch';
import { extractRecipe } from './extractors';
import type { ScrapeRecipeOptions } from './types';

export async function scrapeRecipe(url: string, options: ScrapeRecipeOptions = {}): Promise<Recipe> {
  const html = await fetchPage(url, options);
  const { recipe } = extractRecipe(html);

  if (!recipe) {
    throw new Error('No Schema.org recipe data found in page');
  }

  const soustackRecipe = fromSchemaOrg(recipe);
  if (!soustackRecipe) {
    throw new Error('Schema.org data did not include a valid recipe');
  }

  return soustackRecipe;
}
