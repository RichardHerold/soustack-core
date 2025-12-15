import { load, type CheerioAPI, type Cheerio } from 'cheerio';
import type { SchemaOrgRecipe } from '../types';
import { normalizeText } from './utils';

const SIMPLE_PROPS = [
  'name',
  'description',
  'image',
  'recipeYield',
  'prepTime',
  'cookTime',
  'totalTime'
] as const;

export function extractMicrodata(html: string): SchemaOrgRecipe | null {
  const $ = load(html);
  const recipeEl = $('[itemscope][itemtype*="schema.org/Recipe"]').first();

  if (!recipeEl.length) {
    return null;
  }

  const recipe: SchemaOrgRecipe = {
    '@type': 'Recipe'
  };

  SIMPLE_PROPS.forEach(prop => {
    const value = findPropertyValue($, recipeEl, prop);
    if (value) {
      recipe[prop] = value;
    }
  });

  const ingredients: string[] = [];
  recipeEl.find('[itemprop="recipeIngredient"]').each((_, el) => {
    const text = normalizeText($(el).attr('content') || $(el).text());
    if (text) ingredients.push(text);
  });

  if (ingredients.length) {
    recipe.recipeIngredient = ingredients;
  }

  const instructions: string[] = [];
  recipeEl.find('[itemprop="recipeInstructions"]').each((_, el) => {
    const text =
      normalizeText($(el).attr('content')) ||
      normalizeText($(el).find('[itemprop="text"]').first().text()) ||
      normalizeText($(el).text());
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

function findPropertyValue($: CheerioAPI, context: Cheerio<any>, prop: string): string | undefined {
  const node = context.find(`[itemprop="${prop}"]`).first();
  if (!node.length) return undefined;

  return (
    normalizeText(node.attr('content')) ||
    normalizeText(node.attr('href')) ||
    normalizeText(node.attr('src')) ||
    normalizeText(node.text())
  );
}
