export type RecipeType =
  | 'Recipe'
  | 'https://schema.org/Recipe'
  | 'http://schema.org/Recipe';

export interface HowToStep {
  '@type'?: 'HowToStep' | 'HowToSection' | string;
  name?: string;
  text?: string;
  itemListElement?: Array<string | HowToStep>;
}

export interface SchemaOrgRecipe {
  '@type': string | string[];
  name?: string;
  description?: string;
  image?: string | string[];
  recipeIngredient?: string[];
  recipeInstructions?: Array<string | HowToStep>;
  recipeYield?: string | number;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  author?: unknown;
  datePublished?: string;
  aggregateRating?: unknown;
  [key: string]: unknown;
}

export interface FetchOptions {
  timeout?: number;
  userAgent?: string;
  maxRetries?: number;
}

export interface ScrapeRecipeOptions extends FetchOptions {}

export type ExtractionSource = 'jsonld' | 'microdata';

export interface ExtractionResult {
  recipe: SchemaOrgRecipe | null;
  source: ExtractionSource | null;
}
