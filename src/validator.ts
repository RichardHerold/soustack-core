import Ajv, { ErrorObject, ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import baseSchema from "./schema.json";
import soustackSchema from "./soustack.schema.json";
import baseProfileSchema from "./profiles/base.schema.json";
import cookableProfileSchema from "./profiles/cookable.schema.json";
import quantifiedProfileSchema from "./profiles/quantified.schema.json";
import illustratedProfileSchema from "./profiles/illustrated.schema.json";
import schedulableProfileSchema from "./profiles/schedulable.schema.json";
import { Recipe } from "./types";

type ProfileName =
  | "base"
  | "cookable"
  | "scalable"
  | "quantified"
  | "illustrated"
  | "schedulable";

export interface NormalizedError {
  path: string;
  message: string;
  keyword?: string;
}

export interface NormalizedWarning {
  path: string;
  message: string;
}

export interface ValidateOptions {
  profile?: ProfileName;
  schema?: string;
  collectAllErrors?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: NormalizedError[];
  warnings: NormalizedWarning[];
  normalized?: Recipe;
}

interface ValidationContext {
  ajv: Ajv;
  validators: Partial<Record<ProfileName, ValidateFunction>>;
}

const profileSchemas: Partial<Record<ProfileName, any>> = {
  base: baseProfileSchema,
  cookable: cookableProfileSchema,
  scalable: baseProfileSchema,
  quantified: quantifiedProfileSchema,
  illustrated: illustratedProfileSchema,
  schedulable: schedulableProfileSchema,
};

const validationContexts: Map<boolean, ValidationContext> = new Map();

function createContext(collectAllErrors: boolean): ValidationContext {
  const ajv = new Ajv({ strict: false, allErrors: collectAllErrors });
  addFormats(ajv);

  const loadedIds = new Set<string>();
  const addSchemaIfNew = (schema: any) => {
    if (!schema) return;
    const schemaId = (schema as any)?.$id;
    if (schemaId && loadedIds.has(schemaId)) return;
    ajv.addSchema(schema);
    if (schemaId) loadedIds.add(schemaId);
  };

  addSchemaIfNew(baseSchema);
  addSchemaIfNew(soustackSchema);
  Object.values(profileSchemas).forEach(addSchemaIfNew);

  return { ajv, validators: {} };
}

function getContext(collectAllErrors: boolean): ValidationContext {
  if (!validationContexts.has(collectAllErrors)) {
    validationContexts.set(collectAllErrors, createContext(collectAllErrors));
  }
  return validationContexts.get(collectAllErrors)!;
}

function cloneRecipe<T>(recipe: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(recipe);
  }
  return JSON.parse(JSON.stringify(recipe));
}

function detectProfileFromSchema(schemaRef?: string): ProfileName | undefined {
  if (!schemaRef) return undefined;
  const match = schemaRef.match(/\/profiles\/([a-z]+)\.schema\.json$/i);
  if (match) {
    const profile = match[1].toLowerCase() as ProfileName;
    if (profile in profileSchemas) return profile;
  }
  return undefined;
}

function getValidator(profile: ProfileName, context: ValidationContext): ValidateFunction {
  if (!profileSchemas[profile]) {
    throw new Error(`Unknown Soustack profile: ${profile}`);
  }

  if (!context.validators[profile]) {
    context.validators[profile] = context.ajv.compile(profileSchemas[profile]!);
  }
  return context.validators[profile]!;
}

function normalizeRecipe(recipe: Recipe): { normalized: Recipe; warnings: NormalizedWarning[] } {
  const normalized = cloneRecipe(recipe);
  const warnings: NormalizedWarning[] = [];

  if (
    normalized &&
    typeof normalized === "object" &&
    "version" in normalized &&
    !(normalized as any).recipeVersion &&
    typeof (normalized as any).version === "string"
  ) {
    (normalized as any).recipeVersion = (normalized as any).version;
    warnings.push({ path: "/version", message: "'version' is deprecated; mapped to 'recipeVersion'." });
  }

  return { normalized, warnings };
}

const allowedTopLevelProps = new Set<string>([
  ...Object.keys((soustackSchema as any)?.properties ?? {}),
  "metadata",
  "$schema",
]);

function detectUnknownTopLevelKeys(recipe: any): NormalizedError[] {
  if (!recipe || typeof recipe !== "object") return [];
  const disallowedKeys = Object.keys(recipe).filter(
    (key) => !allowedTopLevelProps.has(key) && !key.startsWith("x-"),
  );

  return disallowedKeys.map((key) => ({
    path: `/${key}`,
    keyword: "additionalProperties",
    message: `Unknown top-level property '${key}' is not allowed by the Soustack spec`,
  }));
}

function formatAjvError(error: ErrorObject): NormalizedError {
  let path = error.instancePath || "/";
  if (error.keyword === "additionalProperties" && (error.params as any)?.additionalProperty) {
    const extra = (error.params as any).additionalProperty;
    path = `${error.instancePath || ""}/${extra}`.replace(/\/+/g, "/") || "/";
  }

  return {
    path,
    keyword: error.keyword,
    message: error.message || "Validation error",
  };
}

function runAjvValidation(
  data: any,
  profile: ProfileName,
  context: ValidationContext,
  schemaRef?: string,
): NormalizedError[] {
  const validator = schemaRef ? context.ajv.getSchema(schemaRef) : undefined;
  const validateFn = (validator as ValidateFunction | undefined) ?? getValidator(profile, context);

  const isValid = validateFn(data);
  return !isValid && validateFn.errors ? validateFn.errors.map(formatAjvError) : [];
}

export function validateRecipe(input: any, options: ValidateOptions = {}): ValidationResult {
  const collectAllErrors = options.collectAllErrors ?? true;
  const context = getContext(collectAllErrors);
  const schemaRef = options.schema ?? (typeof input?.$schema === "string" ? input.$schema : undefined);
  const profile: ProfileName =
    options.profile ?? detectProfileFromSchema(schemaRef) ?? "base";

  const { normalized, warnings } = normalizeRecipe(input as Recipe);

  const unknownKeyErrors = detectUnknownTopLevelKeys(normalized);
  const validationErrors = runAjvValidation(normalized, profile, context, schemaRef);
  const errors = [...unknownKeyErrors, ...validationErrors];

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalized: errors.length === 0 ? normalized : undefined,
  };
}

export function validateRecipeWithProfile(data: any, profile: ProfileName): data is Recipe {
  return validateRecipe(data, { profile }).valid;
}

export function detectProfiles(recipe: any): ProfileName[] {
  const result = validateRecipe(recipe, { profile: "base", collectAllErrors: false });
  if (!result.valid) return [];

  const normalizedRecipe = result.normalized ?? recipe;
  const profiles: ProfileName[] = ["base"];
  const context = getContext(false);

  (Object.keys(profileSchemas) as ProfileName[]).forEach((profile) => {
    if (profile === "base") return;
    if (!profileSchemas[profile]) return;
    const errors = runAjvValidation(normalizedRecipe, profile, context);
    if (errors.length === 0) {
      profiles.push(profile);
    }
  });

  return profiles;
}
