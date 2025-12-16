import { fromSchemaOrg } from '../fromSchemaOrg';
import type { Recipe } from '../types';
import type { SchemaOrgRecipe } from './types';
import { extractRecipeBrowser } from './extractors/browser';

export function extractSchemaOrgRecipeFromHTML(html: string): SchemaOrgRecipe | null {
  const { recipe } = extractRecipeBrowser(html);
  return recipe;
}

export function extractRecipeFromHTML(html: string): Recipe {
  const recipe = extractSchemaOrgRecipeFromHTML(html);

  if (!recipe) {
    throw new Error('No Schema.org recipe data found in HTML');
  }

  const soustackRecipe = fromSchemaOrg(recipe);

  if (!soustackRecipe) {
    throw new Error('Schema.org data did not include a valid recipe');
  }

  return soustackRecipe;
}
