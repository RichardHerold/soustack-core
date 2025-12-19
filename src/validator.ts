import Ajv2020, { ErrorObject, ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import * as fs from "fs";
import * as path from "path";
import { Recipe } from "./types";
import { parseDuration } from "./parsers/duration";
import { normalizeRecipe as normalizeRecipeInput } from "./normalize";

type ProfileName = "minimal" | "core";

// Schema IDs from the vendored spec
const ROOT_SCHEMA_ID = "http://soustack.org/schema/v0.3.0";
const BASE_SCHEMA_ID = "http://soustack.org/schema/recipe/base.schema.json";

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
  ajv: Ajv2020;
  rootValidator?: ValidateFunction;
  baseValidator?: ValidateFunction;
  validators: Map<string, ValidateFunction>;
}

// Cache for validation contexts
const validationContexts: Map<boolean, ValidationContext> = new Map();

/**
 * Recursively finds all .schema.json files in a directory
 */
function findSchemaFiles(dirPath: string, basePath: string = ""): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dirPath)) {
    return files;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = basePath ? path.join(basePath, entry.name) : entry.name;

    if (entry.isDirectory()) {
      files.push(...findSchemaFiles(fullPath, relativePath));
    } else if (entry.isFile() && entry.name.endsWith(".schema.json")) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Loads all schema files from the /spec directory and registers them with Ajv
 */
function loadAllSchemas(ajv: Ajv2020, specDir: string): void {
  // Load root schema
  const rootSchemaPath = path.join(specDir, "soustack.schema.json");
  if (fs.existsSync(rootSchemaPath)) {
    const rootSchema = JSON.parse(fs.readFileSync(rootSchemaPath, "utf8"));
    if (rootSchema.$id) {
      ajv.addSchema(rootSchema, rootSchema.$id);
    }
  }

  // Load base schema first (required for all composed validators)
  const baseSchemaPath = path.join(specDir, "schemas", "recipe", "base.schema.json");
  if (fs.existsSync(baseSchemaPath)) {
    try {
      const baseSchema = JSON.parse(fs.readFileSync(baseSchemaPath, "utf8"));
      if (baseSchema.$id) {
        ajv.addSchema(baseSchema, baseSchema.$id);
        if (!ajv.getSchema(baseSchema.$id)) {
          throw new Error(`Base schema was added but cannot be retrieved with ID ${baseSchema.$id}`);
        }
      } else {
        throw new Error(`Base schema missing $id field`);
      }
    } catch (error: any) {
      throw new Error(`Failed to load base schema from ${baseSchemaPath}: ${error.message}`);
    }
  } else {
    throw new Error(`Base schema file not found at ${baseSchemaPath} (specDir: ${specDir})`);
  }

  // Load all schema files from schemas/recipe directory (base, profiles, modules)
  const recipeSchemasDir = path.join(specDir, "schemas", "recipe");
  if (fs.existsSync(recipeSchemasDir)) {
    const schemaFiles = findSchemaFiles(recipeSchemasDir);
    for (const schemaPath of schemaFiles) {
      // Skip base schema since we already loaded it directly
      if (schemaPath.endsWith("base.schema.json")) {
        continue;
      }
      try {
        const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
        if (schema.$id) {
          try {
            ajv.addSchema(schema, schema.$id);
          } catch (addError: any) {
            // Skip if schema already exists (might be loaded elsewhere)
            if (!addError.message?.includes("already exists")) {
              throw addError;
            }
          }
        }
      } catch (error: any) {
        // Continue loading other schemas even if one fails
        console.error(`Failed to load schema from ${schemaPath}:`, error.message);
      }
    }
  }

  // Load profile schemas from profiles directory (if they exist)
  const profilesDir = path.join(specDir, "profiles");
  if (fs.existsSync(profilesDir)) {
    const schemaFiles = findSchemaFiles(profilesDir);
    for (const schemaPath of schemaFiles) {
      const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
      if (schema.$id) {
        ajv.addSchema(schema, schema.$id);
      }
    }
  }
}

/**
 * Creates a new validation context with all schemas loaded
 */
function createContext(collectAllErrors: boolean, specDir: string): ValidationContext {
  const ajv = new Ajv2020({
    strict: false,
    allErrors: collectAllErrors,
    validateSchema: false, // Don't validate schemas themselves
  });
  addFormats(ajv);

  // Load all schemas from the spec directory
  loadAllSchemas(ajv, specDir);

  // Get validators for root and base schemas
  const rootValidator = ajv.getSchema(ROOT_SCHEMA_ID);
  const baseValidator = ajv.getSchema(BASE_SCHEMA_ID);

  return {
    ajv,
    rootValidator: rootValidator || undefined,
    baseValidator: baseValidator || undefined,
    validators: new Map(),
  };
}

/**
 * Gets or creates a validation context
 */
function getContext(collectAllErrors: boolean): ValidationContext {
  if (!validationContexts.has(collectAllErrors)) {
    // Determine spec directory path
    // In compiled code, __dirname points to dist/, so we need to go up to project root
    // Try __dirname first, then fall back to process.cwd() for flexibility
    let specDir: string;
    if (__dirname.includes("dist")) {
      // We're in dist/, go up to project root then into spec/
      specDir = path.resolve(__dirname, "..", "spec");
    } else {
      // We're in src/ (development), go up to project root then into spec/
      specDir = path.resolve(__dirname, "..", "spec");
    }
    // Fallback: use process.cwd() if the above doesn't work
    if (!fs.existsSync(specDir)) {
      specDir = path.resolve(process.cwd(), "spec");
    }
    validationContexts.set(collectAllErrors, createContext(collectAllErrors, specDir));
  }
  return validationContexts.get(collectAllErrors)!;
}

function cloneRecipe<T>(recipe: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(recipe);
  }
  return JSON.parse(JSON.stringify(recipe));
}

function normalizeRecipe(recipe: any): { normalized: Recipe; warnings: NormalizedWarning[] } {
  // First, apply the new normalization for stacks/modules
  const { recipe: normalizedInput, warnings: inputWarnings } = normalizeRecipeInput(recipe);
  const normalized = cloneRecipe(normalizedInput);
  const warnings: NormalizedWarning[] = inputWarnings.map((msg) => ({
    path: "/stacks",
    message: msg,
  }));

  // Normalize time
  normalizeTime(normalized);

  // Normalize deprecated version field
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

  // Convert stacks map back to modules array for validation (temporary compatibility)
  // The validator still expects modules array format
  if (normalized.stacks && typeof normalized.stacks === "object" && !Array.isArray(normalized.stacks)) {
    const modules: string[] = [];
    for (const [name, version] of Object.entries(normalized.stacks)) {
      if (typeof version === "number" && version >= 1) {
        modules.push(`${name}@${version}`);
      }
    }
    // Keep both for now - stacks is the source of truth, modules is for validator compatibility
    (normalized as any).modules = modules.sort();
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

/**
 * Infers module identifiers from payload fields in the recipe.
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

/**
 * Gets a composed validator for a profile and modules using vendored schemas
 */
function getComposedValidator(
  profile: ProfileName,
  modules: string[],
  context: ValidationContext,
): ValidateFunction {
  const sortedModules = [...modules].sort();
  const cacheKey = `${profile}::${sortedModules.join(",")}`;
  const cached = context.validators.get(cacheKey);
  if (cached) return cached;

  // Build composed schema: base + profile + modules
  const allOf: any[] = [{ $ref: BASE_SCHEMA_ID }];

  // Verify base schema is loaded
  if (!context.ajv.getSchema(BASE_SCHEMA_ID)) {
    throw new Error(`Base schema not loaded: ${BASE_SCHEMA_ID}. Ensure schemas are loaded before creating validators.`);
  }

  // Add profile schema
  const profileSchemaId = `http://soustack.org/schema/recipe/profiles/${profile}.schema.json`;
  if (!context.ajv.getSchema(profileSchemaId)) {
    throw new Error(`Profile schema not loaded: ${profileSchemaId}`);
  }
  allOf.push({ $ref: profileSchemaId });

  // Add module schemas
  for (const moduleId of sortedModules) {
    const match = moduleId.match(/^([a-z0-9_-]+)@(\d+)$/i);
    if (match) {
      const [, name, version] = match;
      // Module schemas use https:// prefix
      const moduleSchemaId = `https://soustack.org/schemas/recipe/modules/${name}/${version}.schema.json`;
      if (!context.ajv.getSchema(moduleSchemaId)) {
        throw new Error(`Module schema not loaded: ${moduleSchemaId}`);
      }
      allOf.push({ $ref: moduleSchemaId });
    }
  }

  const composedSchema = {
    $id: `urn:soustack:composed:${cacheKey}`,
    allOf,
  };
  const validateFn = context.ajv.compile(composedSchema);
  context.validators.set(cacheKey, validateFn);
  return validateFn;
}

/**
 * Validates a recipe against the root schema from the vendored spec.
 * This is the new primary validation function.
 * For recipes with profile/modules, uses composed validation (base + profile + modules).
 * For recipes without profile/modules, validates against root schema directly.
 */
export function validateRecipeSchema(input: unknown): {
  ok: boolean;
  errors: NormalizedError[];
  warnings: string[];
} {
  // Normalize the input first - use normalizeRecipeInput for stacks/modules
  const { recipe: normalizedInput, warnings: inputWarnings } = normalizeRecipeInput(input);
  const normalized = cloneRecipe(normalizedInput);
  const warnings: string[] = [...inputWarnings];

  // Add deprecated version warning if present
  if (
    normalized &&
    typeof normalized === "object" &&
    "version" in normalized &&
    !(normalized as any).recipeVersion &&
    typeof (normalized as any).version === "string"
  ) {
    (normalized as any).recipeVersion = (normalized as any).version;
    warnings.push("'version' is deprecated; mapped to 'recipeVersion'.");
  }

  // Get validation context
  const context = getContext(true);

  // Determine if we should use composed validation or root schema
  const hasProfile = normalized.profile && typeof normalized.profile === "string";
  let modules: string[] = [];
  if (Array.isArray(normalized.modules)) {
    modules.push(...normalized.modules.filter((m: any) => typeof m === "string"));
  } else if (normalized.stacks && typeof normalized.stacks === "object" && !Array.isArray(normalized.stacks)) {
    for (const [name, version] of Object.entries(normalized.stacks)) {
      if (typeof version === "number" && version >= 1) {
        modules.push(`${name}@${version}`);
      }
    }
  }

  // Infer modules from payloads (for module contract enforcement)
  // We include inferred modules in the validation schema, but don't add them to the modules array
  // This allows the module contract (if/then in module schemas) to enforce that modules must be declared
  const inferredModules = inferModulesFromPayload(normalized);
  // Include both declared and inferred modules in the schema validation
  const allModules = new Set([...modules, ...inferredModules]);

  let isValid: boolean;
  let errors: ErrorObject[] = [];

  // Default to core profile if no profile specified
  // Always use composed validation (base + profile + modules) instead of root schema
  const profile: ProfileName = hasProfile
    ? ((normalized.profile as string).toLowerCase() as ProfileName)
    : "core";

  // Always use composed validation for recipes (base + profile + modules)
  // Root schema validation is only for standalone validation without profiles
  if (profile === "minimal" || profile === "core") {
    // Use composed validation (base + profile + modules)
    // Include both declared and inferred modules in schema to enforce contract
    // But only use declared modules in the modules array - this allows contract enforcement

    // Ensure modules array exists for validation (only declared modules, not inferred)
    const validationCopy = cloneRecipe(normalized);
    if (!Array.isArray(validationCopy.modules)) {
      (validationCopy as any).modules = modules.length > 0 ? [...modules].sort() : [];
    } else {
      (validationCopy as any).modules = [...modules].sort();
    }
    // Ensure profile exists
    if (!validationCopy.profile) {
      (validationCopy as any).profile = profile;
    }

    // Use allModules (declared + inferred) in the validator to enforce contract
    const validator = getComposedValidator(profile, Array.from(allModules), context);
    isValid = validator(validationCopy);
    errors = validator.errors || [];

    // Check for unknown top-level keys using root schema (which has additionalProperties: false)
    // The composed validation uses base schema with additionalProperties: true, so we need this check
    if (isValid && context.rootValidator) {
      const rootCheckCopy = cloneRecipe(normalized);
      // Remove fields that root schema doesn't have but are valid in composed validation
      // Root schema doesn't include: @type, profile, modules, stacks, or module payloads
      if ("@type" in rootCheckCopy) {
        delete (rootCheckCopy as any)["@type"];
      }
      if ("stacks" in rootCheckCopy) {
        delete (rootCheckCopy as any).stacks;
      }
      if ("profile" in rootCheckCopy) {
        delete (rootCheckCopy as any).profile;
      }
      if ("modules" in rootCheckCopy) {
        delete (rootCheckCopy as any).modules;
      }
      // Also remove module payload fields that root schema doesn't have
      const moduleFields = ["attribution", "taxonomy", "media", "times", "nutrition", "schedule"];
      for (const field of moduleFields) {
        if (field in rootCheckCopy) {
          delete (rootCheckCopy as any)[field];
        }
      }
      const rootValid = context.rootValidator(rootCheckCopy);
      if (!rootValid && context.rootValidator.errors) {
        // Filter for additionalProperties errors at root level only (unknown top-level keys)
        const unknownKeyErrors = context.rootValidator.errors.filter(
          (e) => e.keyword === "additionalProperties" && (e.instancePath === "" || e.instancePath === "/")
        );
        if (unknownKeyErrors.length > 0) {
          errors.push(...unknownKeyErrors);
          isValid = false;
        }
      }
    }
  } else {
    // Unknown profile - return error
    return {
      ok: false,
      errors: [
        {
          path: "/profile",
          message: `Unknown profile: ${profile}. Supported profiles: minimal, core`,
        },
      ],
      warnings,
    };
  }

  // Convert warnings to string array format
  const warningStrings = warnings;

  return {
    ok: isValid,
    errors: errors.map(formatAjvError),
    warnings: warningStrings,
  };
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

/**
 * Legacy validateRecipe function - now uses the new validateRecipeSchema internally
 * but maintains backward compatibility with profile/module-based validation
 */
export function validateRecipe(input: any, options: ValidateOptions = {}): ValidationResult {
  // Use the new validateRecipeSchema as the base (it normalizes internally)
  const { ok, errors: schemaErrors, warnings: schemaWarnings } = validateRecipeSchema(input);
  
  // Get normalized recipe for return value
  const { normalized } = normalizeRecipe(input);
  
  // Convert warnings format
  const warnings: NormalizedWarning[] = schemaWarnings.map((msg) => ({
    path: "/",
    message: msg,
  }));

  // Check instruction graph if schedule module is present
  const modules: string[] = [];
  if (Array.isArray(normalized.modules)) {
    modules.push(...normalized.modules.filter((value) => typeof value === "string"));
  } else if (normalized.stacks && typeof normalized.stacks === "object" && !Array.isArray(normalized.stacks)) {
    for (const [name, version] of Object.entries(normalized.stacks)) {
      if (typeof version === "number" && version >= 1) {
        modules.push(`${name}@${version}`);
      }
    }
  }

  const graphErrors =
    modules.includes("schedule@1") && schemaErrors.length === 0 ? checkInstructionGraph(normalized) : [];
  const errors = [...schemaErrors, ...graphErrors];

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
  const result = validateRecipe(recipe, { collectAllErrors: false });
  if (!result.valid) return [];

  // For now, return core as default since we're using root schema validation
  // This can be enhanced later to check against specific profile schemas
  return ["core"];
}
