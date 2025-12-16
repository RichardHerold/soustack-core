export interface SchemaOrgRecipe {
  '@context'?:
    | string
    | Array<string | Record<string, unknown>>
    | Record<string, unknown>;
  '@type'?: string | string[];
  name: string;
  description?: string;
  image?: SchemaOrgImage;
  recipeIngredient?: SchemaOrgIngredientList;
  recipeInstructions?: SchemaOrgInstructionList;
  recipeYield?: string | number | SchemaOrgYield | Array<string | number | SchemaOrgYield>;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  recipeCategory?: string | string[];
  recipeCuisine?: string | string[];
  keywords?: string;
  author?: SchemaOrgPersonOrOrganization | SchemaOrgPersonOrOrganization[] | string | string[];
  publisher?: SchemaOrgPersonOrOrganization | SchemaOrgPersonOrOrganization[] | string | string[];
  url?: string;
  mainEntityOfPage?: string;
  datePublished?: string;
  dateModified?: string;
  nutrition?: NutritionInformation;
  '@graph'?: unknown;
}

export type SchemaOrgIngredientList = string | string[];

export type SchemaOrgInstructionList =
  | string
  | HowToStep
  | HowToSection
  | Array<string | HowToStep | HowToSection>;

export type SchemaOrgInstruction = string | HowToStep | HowToSection;

export interface SchemaOrgImageObject {
  '@type'?: string;
  url?: string;
  contentUrl?: string;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export type SchemaOrgImage =
  | string
  | SchemaOrgImageObject
  | Array<string | SchemaOrgImageObject>;

export interface SchemaOrgYield {
  amount?: number;
  unit?: string;
  description?: string;
}

export interface HowToStep {
  '@type': 'HowToStep';
  text?: string;
  name?: string;
  url?: string;
  image?: SchemaOrgImage;
  '@id'?: string;
  id?: string;
  totalTime?: string;
  performTime?: string;
  prepTime?: string;
  duration?: string;
}

export interface HowToSection {
  '@type': 'HowToSection';
  name: string;
  itemListElement: Array<string | HowToStep | HowToSection>;
}

export interface SchemaOrgPersonOrOrganization {
  '@type'?: 'Person' | 'Organization';
  name?: string;
  url?: string;
}

export interface NutritionInformation {
  [key: string]: string | number | null | undefined;
}
