import Ajv, { ErrorObject, ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import baseSchema from "./schemas/recipe/base.schema.json";
import coreProfileSchema from "./schemas/recipe/profiles/core.schema.json";
import minimalProfileSchema from "./schemas/recipe/profiles/minimal.schema.json";
import scheduleModuleV1 from "./schemas/recipe/modules/schedule/1.schema.json";
import nutritionModuleV1 from "./schemas/recipe/modules/nutrition/1.schema.json";
import attributionModuleV1 from "./schemas/recipe/modules/attribution/1.schema.json";
import taxonomyModuleV1 from "./schemas/recipe/modules/taxonomy/1.schema.json";
import mediaModuleV1 from "./schemas/recipe/modules/media/1.schema.json";
import timesModuleV1 from "./schemas/recipe/modules/times/1.schema.json";
import { Recipe } from "./types";
import { parseDuration } from "./parsers/duration";

type ProfileName = "minimal" | "core";

// Use the actual schema IDs from the schema files
const CANONICAL_BASE_SCHEMA_ID = (baseSchema as any).$id || "http://soustack.org/schema/recipe/base.schema.json";

const canonicalProfileId = (profile: string): string => {
  if (profile === "minimal") {
    return (minimalProfileSchema as any).$id || "http://soustack.org/schema/recipe/profiles/minimal.schema.json";
  }
  if (profile === "core") {
    return (coreProfileSchema as any).$id || "http://soustack.org/schema/recipe/profiles/core.schema.json";
  }
  throw new Error(`Unknown profile: ${profile}`);
};

const moduleIdToSchemaRef = (moduleId: string): string => {
  const match = moduleId.match(/^([a-z0-9_-]+)@(\d+(?:\.\d+)*)$/i);
  if (!match) {
    throw new Error(`Invalid module identifier '${moduleId}'. Expected <name>@<version>.`);
  }

  const [, name, version] = match;
  // Use the actual schema ID from the module schema file
  const moduleSchemas: Record<string, any> = {
    "schedule@1": scheduleModuleV1,
    "nutrition@1": nutritionModuleV1,
    "attribution@1": attributionModuleV1,
    "taxonomy@1": taxonomyModuleV1,
    "media@1": mediaModuleV1,
    "times@1": timesModuleV1,
  };
  const schema = moduleSchemas[moduleId];
  if (schema && (schema as any).$id) {
    return (schema as any).$id;
  }
  // Fallback to constructed ID
  return `https://soustack.org/schemas/recipe/modules/${name}/${version}.schema.json`;
};

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
  validators: Map<string, ValidateFunction>;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const profileSchemas: Record<ProfileName, any> = {
  minimal: minimalProfileSchema,
  core: coreProfileSchema,
};

const moduleSchemas: Record<string, any> = {
  "schedule@1": scheduleModuleV1,
  "nutrition@1": nutritionModuleV1,
  "attribution@1": attributionModuleV1,
  "taxonomy@1": taxonomyModuleV1,
  "media@1": mediaModuleV1,
  "times@1": timesModuleV1,
};

const validationContexts: Map<boolean, ValidationContext> = new Map();

function createContext(collectAllErrors: boolean): ValidationContext {
  const ajv = new Ajv({ strict: false, allErrors: collectAllErrors });
  addFormats(ajv);

  const addSchemaWithAlias = (schema: any, alias?: string) => {
    if (!schema) return;
    // Use the schema's $id if available, otherwise use the provided alias
    const schemaId = (schema as any).$id || alias;
    if (schemaId) {
      ajv.addSchema(schema, schemaId);
    } else {
      ajv.addSchema(schema);
    }
  };

  // Add base schema
  addSchemaWithAlias(baseSchema, CANONICAL_BASE_SCHEMA_ID);

  // Add profile schemas
  Object.entries(profileSchemas).forEach(([name, schema]) => {
    addSchemaWithAlias(schema, canonicalProfileId(name));
  });

  // Add module schemas
  Object.entries(moduleSchemas).forEach(([moduleId, schema]) => {
    addSchemaWithAlias(schema, moduleIdToSchemaRef(moduleId));
  });

  return { ajv, validators: new Map() };
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

function resolveSchemaRef(inputSchema: unknown, requestedSchema?: string): string | undefined {
  if (typeof requestedSchema === "string") return requestedSchema;
  if (typeof inputSchema !== "string") return undefined;

  return detectProfileFromSchema(inputSchema) ? inputSchema : undefined;
}

/**
 * Infer module identifiers from payload fields in the recipe.
 * Returns an array of module IDs (e.g., ["times@1", "nutrition@1"]).
 */
function inferModulesFromPayload(recipe: any): string[] {
  const inferred: string[] = [];
  
  // Map payload field names to module IDs
  const payloadToModule: Record<string, string> = {
    attribution: "attribution@1",
    taxonomy: "taxonomy@1",
    media: "media@1",
    times: "times@1",
    nutrition: "nutrition@1",
    schedule: "schedule@1",
  };

  for (const [field, moduleId] of Object.entries(payloadToModule)) {
    if (recipe && typeof recipe === "object" && field in recipe && recipe[field] != null) {
      // Check if the payload is a non-empty object/array
      const payload = recipe[field];
      if (typeof payload === "object" && !Array.isArray(payload)) {
        // For objects, check if it has any properties
        if (Object.keys(payload).length > 0) {
          inferred.push(moduleId);
        }
      } else if (Array.isArray(payload) && payload.length > 0) {
        inferred.push(moduleId);
      } else if (payload !== null && payload !== undefined) {
        // For primitive values, consider it present
        inferred.push(moduleId);
      }
    }
  }

  return inferred;
}

function getCombinedValidator(
  profile: ProfileName,
  modules: string[],
  recipe: any,
  context: ValidationContext,
): ValidateFunction {
  // Infer modules from payloads
  const inferredModules = inferModulesFromPayload(recipe);
  
  // Union of declared and inferred modules
  const allModules = new Set([...modules, ...inferredModules]);
  const sortedModules = Array.from(allModules).sort();
  
  const cacheKey = `${profile}::${sortedModules.join(",")}`;
  const cached = context.validators.get(cacheKey);
  if (cached) return cached;

  if (!profileSchemas[profile]) {
    throw new Error(`Unknown Soustack profile: ${profile}`);
  }

  // Composed validation: allOf: [base, profile overlay, ...module overlays]
  // Include schemas for both declared AND inferred modules to enforce contract
  const schema = {
    $id: `urn:soustack:recipe:${cacheKey}`,
    allOf: [
      { $ref: CANONICAL_BASE_SCHEMA_ID },
      { $ref: canonicalProfileId(profile) },
      ...sortedModules.map((moduleId) => ({ $ref: moduleIdToSchemaRef(moduleId) })),
    ],
  };

  const validateFn = context.ajv.compile(schema);
  context.validators.set(cacheKey, validateFn);
  return validateFn;
}

function normalizeRecipe(recipe: Recipe): { normalized: Recipe; warnings: NormalizedWarning[] } {
  const normalized = cloneRecipe(recipe);
  const warnings: NormalizedWarning[] = [];

  normalizeTime(normalized);

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

function normalizeTime(recipe: Recipe): void {
  const time = (recipe as any)?.time;
  if (!time || typeof time !== "object" || Array.isArray(time)) return;

  const structuredKeys: Array<"prep" | "active" | "passive" | "total"> = [
    "prep",
    "active",
    "passive",
    "total",
  ];

  structuredKeys.forEach((key) => {
    const value = (time as any)[key];
    if (typeof value === "number") return;

    const parsed = parseDuration(value as any);
    if (parsed !== null) {
      (time as any)[key] = parsed;
    }
  });
}

// Allowed top-level properties from base schema plus common extensions
// Note: base schema has additionalProperties: true, so we only reject truly unknown fields
const allowedTopLevelProps = new Set<string>([
  ...Object.keys((baseSchema as any)?.properties ?? {}),
  "$schema",
  // Module fields (validated by module schemas)
  "attribution",
  "taxonomy",
  "media",
  "times",
  "nutrition",
  "schedule",
  // Common recipe fields (allowed by base schema's additionalProperties: true)
  "description",
  "image",
  "category",
  "tags",
  "source",
  "dateAdded",
  "dateModified",
  "yield",
  "time",
  "id",
  "title",
  "recipeVersion",
  "version", // deprecated but allowed
  "equipment",
  "storage",
  "substitutions",
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
  modules: string[],
  context: ValidationContext,
): NormalizedError[] {
  try {
    const validateFn = getCombinedValidator(profile, modules, data, context);
    const isValid = validateFn(data);
    return !isValid && validateFn.errors ? validateFn.errors.map(formatAjvError) : [];
  } catch (error) {
    return [
      {
        path: "/",
        message: error instanceof Error ? error.message : "Validation failed to initialize",
      },
    ];
  }
}

function isInstruction(item: any): item is { id?: string; dependsOn?: string[] } {
  return item && typeof item === "object" && !Array.isArray(item) && "text" in item;
}

function isInstructionSubsection(item: any): item is { items: any[] } {
  return item && typeof item === "object" && !Array.isArray(item) && "items" in item && "subsection" in item;
}

export function checkInstructionGraph(recipe: Recipe): NormalizedError[] {
  const instructions = (recipe as any)?.instructions;
  if (!Array.isArray(instructions)) return [];

  const instructionIds = new Set<string>();
  const dependencyRefs: { fromId?: string; toId: string; path: string }[] = [];

  const collect = (items: any[], basePath: string) => {
    items.forEach((item, index) => {
      const currentPath = `${basePath}/${index}`;

      if (isInstructionSubsection(item) && Array.isArray(item.items)) {
        collect(item.items, `${currentPath}/items`);
        return;
      }

      if (isInstruction(item)) {
        const id = typeof item.id === "string" ? item.id : undefined;
        if (id) instructionIds.add(id);

        if (Array.isArray(item.dependsOn)) {
          item.dependsOn.forEach((depId, depIndex) => {
            if (typeof depId === "string") {
              dependencyRefs.push({
                fromId: id,
                toId: depId,
                path: `${currentPath}/dependsOn/${depIndex}`,
              });
            }
          });
        }
      }
    });
  };

  collect(instructions, "/instructions");

  const errors: NormalizedError[] = [];

  dependencyRefs.forEach((ref) => {
    if (!instructionIds.has(ref.toId)) {
      errors.push({
        path: ref.path,
        message: `Instruction dependency references missing id '${ref.toId}'.`,
      });
    }
  });

  const adjacency = new Map<string, { toId: string; path: string }[]>();
  dependencyRefs.forEach((ref) => {
    if (ref.fromId && instructionIds.has(ref.fromId) && instructionIds.has(ref.toId)) {
      const list = adjacency.get(ref.fromId) ?? [];
      list.push({ toId: ref.toId, path: ref.path });
      adjacency.set(ref.fromId, list);
    }
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const detectCycles = (nodeId: string) => {
    if (visiting.has(nodeId)) return;
    if (visited.has(nodeId)) return;

    visiting.add(nodeId);
    const neighbors = adjacency.get(nodeId) ?? [];
    neighbors.forEach((edge) => {
      if (visiting.has(edge.toId)) {
        errors.push({
          path: edge.path,
          message: `Circular dependency detected involving instruction id '${edge.toId}'.`,
        });
        return;
      }
      detectCycles(edge.toId);
    });
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  instructionIds.forEach((id) => detectCycles(id));

  return errors;
}

export function validateRecipe(input: any, options: ValidateOptions = {}): ValidationResult {
  const collectAllErrors = options.collectAllErrors ?? true;
  const context = getContext(collectAllErrors);
  const schemaRef = resolveSchemaRef(input?.$schema, options.schema);
  const profileFromDocument = typeof input?.profile === "string" ? (input.profile as ProfileName) : undefined;
  const profile: ProfileName =
    options.profile ?? profileFromDocument ?? detectProfileFromSchema(schemaRef) ?? "core";
  // Modules default to [] if missing
  const modulesFromDocument = Array.isArray(input?.modules)
    ? (input.modules as string[]).filter((value) => typeof value === "string")
    : [];
  const modules = modulesFromDocument.length > 0 ? [...modulesFromDocument].sort() : [];

  const { normalized, warnings } = normalizeRecipe(input as Recipe);

  // Ensure profile is set in normalized recipe (required by profile schemas)
  if (!profileFromDocument) {
    (normalized as any).profile = profile;
  } else {
    (normalized as any).profile = profileFromDocument;
  }
  
  if (modulesFromDocument.length > 0) {
    (normalized as any).modules = modules;
  }

  const unknownKeyErrors = detectUnknownTopLevelKeys(normalized);
  const validationErrors = runAjvValidation(normalized, profile, modules, context);
  // Check instruction graph if schedule module is present
  const graphErrors =
    modules.includes("schedule@1") && validationErrors.length === 0
      ? checkInstructionGraph(normalized)
      : [];
  const errors = [...unknownKeyErrors, ...validationErrors, ...graphErrors];

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
  const result = validateRecipe(recipe, { profile: "core", collectAllErrors: false });
  if (!result.valid) return [];

  const normalizedRecipe = result.normalized ?? recipe;
  const profiles: ProfileName[] = [];
  const context = getContext(false);

  // Check which profiles the recipe satisfies
  (Object.keys(profileSchemas) as ProfileName[]).forEach((profile) => {
    if (!profileSchemas[profile]) return;
    const errors = runAjvValidation(normalizedRecipe, profile, [], context);
    if (errors.length === 0) {
      profiles.push(profile);
    }
  });

  return profiles;
}
