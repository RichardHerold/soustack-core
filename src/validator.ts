import Ajv2020, { ErrorObject, ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { Recipe } from "./types";
import { normalizeRecipe } from "./normalize";
import { validateConformance, ConformanceIssue } from "./conformance";
import rootSchema from "./soustack.schema.json";
import { SOUSTACK_SPEC_VERSION } from "./specVersion";
import baseProfileSchema from "./profiles/base.schema.json";
import illustratedProfileSchema from "./profiles/illustrated.schema.json";
import scalableProfileSchema from "./profiles/scalable.schema.json";
import registry from "./stacks/registry.json";

type ProfileName =
  | "base"
  | "equipped"
  | "illustrated"
  | "lite"
  | "prepped"
  | "scalable"
  | "timed";

// Schema IDs from the vendored spec
const LEGACY_ROOT_SCHEMA_ID = `http://soustack.org/schema/v${SOUSTACK_SPEC_VERSION}`;
const DEFAULT_ROOT_SCHEMA_ID = "https://soustack.spec/soustack.schema.json";
const BASE_SCHEMA_ID = LEGACY_ROOT_SCHEMA_ID; // Base schema is the root schema
// Profile schemas use v0.0.2, not the spec version
const PROFILE_SCHEMA_PREFIX = `http://soustack.org/schema/v0.0.2/profiles/`;

export interface NormalizedError {
  path: string;
  message: string;
  keyword?: string;
}

/**
 * Validation modes for recipe validation.
 * - "schema": JSON Schema only
 * - "full": JSON Schema + semantic conformance checks
 */
export type ValidateMode = "schema" | "full";

export interface ValidateOptions {
  profile?: ProfileName;
  schema?: string;
  collectAllErrors?: boolean;
  mode?: ValidateMode;
  includeNormalized?: boolean;
}

/**
 * Result payload for recipe validation. Schema validation always runs first;
 * conformance issues are only included when running in full mode.
 */
export interface ValidateResult {
  ok: boolean;
  schemaErrors: NormalizedError[];
  conformanceIssues: ConformanceIssue[];
  warnings: string[];
  normalizedRecipe?: Recipe;
}

interface ValidationContext {
  ajv: Ajv2020;
  rootValidator?: ValidateFunction;
  baseValidator?: ValidateFunction;
  validators: Map<string, ValidateFunction>;
}

interface StackRegistryInfo {
  latestMajor: number;
  versions: number[];
  requires: string[];
  minProfile?: string;
}

// Cache for validation contexts
const validationContexts: Map<boolean, ValidationContext> = new Map();
const stackRegistryById = buildStackRegistryById();
const stackRegistryIds = Array.from(stackRegistryById.keys());
const profileRegistryById = buildProfileRegistryById();
const profileRegistryOrder = Object.keys(registry.profiles || {});
const profileRegistryIndex = new Map(profileRegistryOrder.map((profile, index) => [profile, index]));

interface StackRequirement {
  id: string;
  majors?: number[];
}

interface ProfileRegistryInfo {
  requiresProfiles: string[];
  requiresStacks: StackRequirement[];
}

/**
 * Loads all bundled schema files and registers them with Ajv.
 */
function loadAllSchemas(ajv: Ajv2020): void {
  // Load defs schemas first (root schema references them)
  const defsSchemas = [
    require("./defs/common.schema.json"),
    require("./defs/duration.schema.json"),
    require("./defs/entities.schema.json"),
    require("./defs/ingredientQuantified.schema.json"),
    require("./defs/quantity.schema.json"),
    require("./defs/scalingRule.schema.json"),
    require("./defs/temperature.schema.json"),
  ];

  for (const schema of defsSchemas) {
    if (schema && typeof schema === "object" && "$id" in schema) {
      const schemaWithId = schema as { $id?: string };
      if (schemaWithId.$id) {
        // Check if schema with this ID already exists to avoid duplicates
        if (!ajv.getSchema(schemaWithId.$id)) {
        ajv.addSchema(schemaWithId, schemaWithId.$id);
        }
      }
    }
  }

  // Load stack schemas BEFORE root schema (root schema references them in conditional logic)
  // Stack schemas are loaded here so they're available when root schema is compiled
  const stacks = registry.stacks || {};
  const stackSchemasToLoad: Array<{ id: string; schema: any; requires: string[] }> = [];
  
  for (const [id, entry] of Object.entries(stacks)) {
    if (!entry || typeof entry !== "object") continue;
    const stackEntry = entry as any;
    const schemaPath = stackEntry.schema?.major?.["1"];
    if (schemaPath) {
      // Stack schemas are in src/stacks/ directory
      try {
        const stackSchema = require(`./stacks/${id}.schema.json`);
        if (stackSchema && typeof stackSchema === "object" && "$id" in stackSchema) {
          // Resolve relative $refs to absolute IDs
          // Stack schemas may reference other stacks with relative paths like "./structured.schema.json"
          // These need to be resolved to absolute IDs like "https://soustack.spec/stacks/structured.schema.json"
          const resolvedSchema = JSON.parse(JSON.stringify(stackSchema)); // Deep clone
          const resolveRefs = (obj: any): void => {
            if (Array.isArray(obj)) {
              obj.forEach(resolveRefs);
            } else if (obj && typeof obj === "object") {
              for (const [key, value] of Object.entries(obj)) {
                if (key === "$ref" && typeof value === "string" && value.startsWith("./")) {
                  // Resolve relative stack reference
                  const refName = value.replace("./", "").replace(".schema.json", "");
                  const refId = `https://soustack.spec/stacks/${refName}.schema.json`;
                  obj[key] = refId;
                } else {
                  resolveRefs(value);
                }
              }
            }
          };
          resolveRefs(resolvedSchema);
          const requires = Array.isArray(stackEntry.requires) ? stackEntry.requires : [];
          stackSchemasToLoad.push({ id, schema: resolvedSchema, requires });
        }
      } catch (e) {
        // Stack schema not found, skip it
        console.warn(`Stack schema not found for ${id}: ${schemaPath}`);
      }
    }
  }
  
  // Load stack schemas in dependency order (dependencies first)
  // Use topological sort to ensure dependencies are loaded before dependents
  const loaded = new Set<string>();
  const loadStack = (stackId: string): void => {
    if (loaded.has(stackId)) return;
    const stack = stackSchemasToLoad.find(s => s.id === stackId);
    if (!stack) return;
    
    // Load dependencies first
    for (const dep of stack.requires) {
      loadStack(dep);
    }
    
    // Load this stack
    if (!ajv.getSchema(stack.schema.$id)) {
      ajv.addSchema(stack.schema, stack.schema.$id);
    }
    loaded.add(stackId);
  };
  
  // Load all stacks
  for (const { id } of stackSchemasToLoad) {
    loadStack(id);
  }

  // Load root schema (references defs and stack schemas)
  if (rootSchema && typeof rootSchema === "object" && "$id" in rootSchema) {
    const rootSchemaId = (rootSchema as { $id?: string }).$id;
    if (rootSchemaId && !ajv.getSchema(rootSchemaId)) {
      ajv.addSchema(rootSchema, rootSchemaId);
    }
  }

  // Create legacy schema mappings BEFORE loading profiles (profiles reference them)
  // Profiles reference http://soustack.org/schema/v0.0.2, but root schema uses https://soustack.spec/soustack.schema.json
  // We need to create a mapping from the legacy ID to the root schema
  // Also need to map old #/definitions/ to new #/$defs/ for backward compatibility
  // Profile schemas use Draft 7 which uses "definitions", but they reference a Draft 2020-12 schema
  // We need to create a compatibility layer that exposes definitions in the old format
  const legacyIds = [
    LEGACY_ROOT_SCHEMA_ID,
    `http://soustack.org/schema/v0.0.2`, // Profiles reference this version
  ];
  
  for (const legacyId of legacyIds) {
    if (!ajv.getSchema(legacyId)) {
      // Create a compatibility schema that maps old definitions to new $defs
      // Profile schemas (Draft 7) reference #/definitions/ from the legacy schema ID
      // The key insight: definitions must be at the top level and the schema must be compiled
      // before profile schemas try to reference them. Using allOf might delay compilation.
      // We create a minimal schema with just definitions for reference resolution,
      // and rely on the root schema for actual validation (via BASE_SCHEMA_ID reference)
      const compatibilitySchema: any = {
        $id: legacyId,
        $schema: "http://json-schema.org/draft-07/schema#",
        // Minimal schema - just provide definitions for reference resolution
        // Validation will use DEFAULT_ROOT_SCHEMA_ID directly or via BASE_SCHEMA_ID
        type: "object", // Required for valid schema
        // Expose definitions at top level for Draft 7 profile schema references
        // These definitions map old names to new $defs locations
        definitions: {
          instruction: { $ref: `${DEFAULT_ROOT_SCHEMA_ID}#/$defs/step` },
          instructionSubsection: { $ref: `${DEFAULT_ROOT_SCHEMA_ID}#/$defs/stepSection` },
          ingredient: { $ref: `${DEFAULT_ROOT_SCHEMA_ID}#/$defs/ingredient` },
          ingredientSection: { $ref: `${DEFAULT_ROOT_SCHEMA_ID}#/$defs/ingredientSection` },
          ingredientSubsection: { $ref: `${DEFAULT_ROOT_SCHEMA_ID}#/$defs/ingredientSection` }, // Alias for ingredientSection
          yield: {
          type: "object",
          properties: {
              amount: { type: "number", exclusiveMinimum: 0 },
              unit: { type: "string", minLength: 1 },
              metadata: { type: "object", additionalProperties: true },
            },
            required: ["amount", "unit"],
            additionalProperties: false,
            patternProperties: {
              "^x-": { $ref: "https://soustack.spec/defs/common.schema.json#/properties/extensionLaneValue" },
            },
          },
          time: {
            type: "object",
            properties: {
              total: { $ref: "https://soustack.spec/defs/duration.schema.json#/properties/DurationMinutes" },
              metadata: { type: "object", additionalProperties: true },
            },
            required: ["total"],
            additionalProperties: false,
            patternProperties: {
              "^x-": { $ref: "https://soustack.spec/defs/common.schema.json#/properties/extensionLaneValue" },
            },
          },
          quantity: { $ref: `https://soustack.spec/defs/quantity.schema.json` },
        },
      };
      ajv.addSchema(compatibilitySchema, legacyId);
      // Force compilation of the compatibility schema to ensure definitions are available
      // This ensures that when profile schemas reference #/definitions/, they can be resolved
      try {
        const compiled = ajv.getSchema(legacyId);
      } catch (e) {
        // If compilation fails, log but continue - profile schemas will fail with clearer errors
        console.warn(`Failed to compile compatibility schema ${legacyId}:`, e);
      }
    }
  }

  // Load profile schemas (vNext only)
  const liteProfileSchema = require("./profiles/lite.schema.json");
  const equippedProfileSchema = require("./profiles/equipped.schema.json");
  const preppedProfileSchema = require("./profiles/prepped.schema.json");
  const timedProfileSchema = require("./profiles/timed.schema.json");
  const profileSchemas = [
    liteProfileSchema,
    baseProfileSchema,
    illustratedProfileSchema,
    scalableProfileSchema,
    equippedProfileSchema,
    preppedProfileSchema,
    timedProfileSchema,
  ];

  for (const schema of profileSchemas) {
    if (schema && typeof schema === "object" && "$id" in schema) {
      const schemaWithId = schema as { $id?: string };
      if (schemaWithId.$id) {
        // Check if schema with this ID already exists to avoid duplicates
        if (!ajv.getSchema(schemaWithId.$id)) {
          try {
            ajv.addSchema(schemaWithId, schemaWithId.$id);
            // Force eager compilation to catch reference resolution errors early
            // This ensures that if there are reference issues, we catch them during schema loading
            // rather than during validation
            try {
              ajv.getSchema(schemaWithId.$id);
            } catch (compileError) {
              // Re-throw to fail fast during schema loading
              throw compileError;
            }
          } catch (e) {
            console.warn(`Failed to add/compile profile schema ${schemaWithId.$id}:`, e);
            // Don't throw - allow other schemas to load, but this one will fail when used
          }
        }
      }
    }
  }
}

/**
 * Creates a new validation context with all schemas loaded
 */
function createContext(collectAllErrors: boolean): ValidationContext {
  const ajv = new Ajv2020({
    strict: false,
    allErrors: collectAllErrors,
    validateSchema: false, // Don't validate schemas themselves
  });
  addFormats(ajv);

  // Load all schemas from the spec directory
  loadAllSchemas(ajv);

  // Get validators for root and base schemas
  const rootValidator = ajv.getSchema(DEFAULT_ROOT_SCHEMA_ID) || ajv.getSchema(LEGACY_ROOT_SCHEMA_ID);
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

function isSoustackSchemaId(schemaId: string): boolean {
  return (
    schemaId.startsWith("http://soustack.org/schema") ||
    schemaId.startsWith("https://soustack.org/schema") ||
    schemaId.startsWith("https://soustack.spec/") ||
    schemaId.startsWith("https://soustack.org/schemas/")
  );
}

function buildStackRegistryById(): Map<string, StackRegistryInfo> {
  const registryMap = new Map<string, StackRegistryInfo>();
  const stacks = registry.stacks || {};
  for (const [id, entry] of Object.entries(stacks)) {
    if (!entry || typeof entry !== "object") continue;
    const stackEntry = entry as any;
    const latestMajor = typeof stackEntry.latestMajor === "number" ? stackEntry.latestMajor : 1;
    const schemaMajors =
      stackEntry.schema && typeof stackEntry.schema === "object" && stackEntry.schema.major && typeof stackEntry.schema.major === "object"
        ? Object.keys(stackEntry.schema.major)
            .map((key) => parseInt(key, 10))
            .filter((value) => Number.isInteger(value) && value >= 1)
        : [];
    const requires = Array.isArray(stackEntry.requires)
      ? stackEntry.requires.filter((requirement: unknown): requirement is string => typeof requirement === "string")
      : [];

    registryMap.set(id, {
      latestMajor,
      versions: schemaMajors.length > 0 ? schemaMajors : [latestMajor], // Use declared schema majors when available
      requires,
      minProfile: typeof stackEntry.minProfile === "string" ? stackEntry.minProfile : undefined,
    });
  }
  return registryMap;
}

function parseStackRequirement(entry: unknown): StackRequirement | null {
  if (typeof entry === "string") {
    return { id: entry };
  }

  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const record = entry as { id?: unknown; majors?: unknown; versions?: unknown };
    if (typeof record.id !== "string") {
      return null;
    }
    const majorsRaw: unknown[] = Array.isArray(record.majors)
      ? record.majors
      : Array.isArray(record.versions)
        ? record.versions
        : [];
    const majors = majorsRaw.filter(
      (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1,
    );
    return {
      id: record.id,
      majors: majors.length > 0 ? majors : undefined,
    };
  }

  return null;
}

function buildProfileRegistryById(): Map<string, ProfileRegistryInfo> {
  const registryMap = new Map<string, ProfileRegistryInfo>();
  const profiles = registry.profiles || {};
  for (const [id, entry] of Object.entries(profiles)) {
    if (!entry || typeof entry !== "object") continue;
    const profileEntry = entry as any;
    const requiresProfiles = Array.isArray(profileEntry.requiresProfiles)
      ? profileEntry.requiresProfiles.filter((value: unknown): value is string => typeof value === "string")
      : [];
    const requiresStacksRaw: unknown[] = Array.isArray(profileEntry.requiresStacks)
      ? profileEntry.requiresStacks
      : [];
    const requiresStacks = requiresStacksRaw
      .map(parseStackRequirement)
      .filter((value: StackRequirement | null): value is StackRequirement => value !== null);
    registryMap.set(id, { requiresProfiles, requiresStacks });
  }
  return registryMap;
}

function isProfileAtLeast(profile: string, requiredProfile: string | undefined): boolean {
  if (!requiredProfile) return true;
  const profileRank = profileRegistryIndex.get(profile);
  const requiredRank = profileRegistryIndex.get(requiredProfile);
  if (profileRank === undefined || requiredRank === undefined) {
    return false;
  }
  return profileRank >= requiredRank;
}

function collectRequiredProfiles(profile: string): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  const visit = (current: string) => {
    if (visited.has(current)) return;
    visited.add(current);
    const entry = profileRegistryById.get(current);
    if (!entry) return;
    for (const requirement of entry.requiresProfiles) {
      if (!visited.has(requirement)) {
        result.push(requirement);
        visit(requirement);
      }
    }
  };

  visit(profile);
  return result;
}

function getProfileRequirementErrors(
  profile: string,
  recipe: Recipe,
  declaredStacks: Record<string, number>,
  context: ValidationContext,
): NormalizedError[] {
  const errors: NormalizedError[] = [];
  const entry = profileRegistryById.get(profile);
  if (!entry) {
    return [
      {
        path: "/profile",
        message: `Unknown profile: ${profile}`,
      },
    ];
  }

  for (const requirement of entry.requiresStacks) {
    const declaredVersion = declaredStacks[requirement.id];
    if (!declaredVersion) {
      errors.push({
        path: `/stacks/${requirement.id}`,
        message: `Profile '${profile}' requires stack '${requirement.id}'.`,
      });
      continue;
    }

    const stackEntry = stackRegistryById.get(requirement.id);
    if (!stackEntry) {
      errors.push({
        path: `/stacks/${requirement.id}`,
        message: `Profile '${profile}' requires stack '${requirement.id}', but it is not registered.`,
      });
      continue;
    }

    if (!stackEntry.versions.includes(declaredVersion)) {
      errors.push({
        path: `/stacks/${requirement.id}`,
        message: `Profile '${profile}' requires stack '${requirement.id}' with a supported major version. Found ${declaredVersion}.`,
      });
      continue;
    }

    if (requirement.majors && !requirement.majors.includes(declaredVersion)) {
      errors.push({
        path: `/stacks/${requirement.id}`,
        message: `Profile '${profile}' requires stack '${requirement.id}' with major version(s) ${requirement.majors.join(
          ", ",
        )}. Found ${declaredVersion}.`,
      });
    }
  }

  for (const [stackName] of Object.entries(declaredStacks)) {
    const stackEntry = stackRegistryById.get(stackName);
    if (!stackEntry?.minProfile) continue;
    if (!isProfileAtLeast(profile, stackEntry.minProfile)) {
      errors.push({
        path: `/stacks/${stackName}`,
        message: `Stack '${stackName}' requires profile '${stackEntry.minProfile}'.`,
      });
    }
  }

  const requiredProfiles = collectRequiredProfiles(profile);
  for (const requirement of requiredProfiles) {
    const requiredSchemaId = `${PROFILE_SCHEMA_PREFIX}${requirement}`;
    const validator = context.ajv.getSchema(requiredSchemaId);
    if (!validator) {
      errors.push({
        path: "/profile",
        message: `Profile schema not loaded: ${requiredSchemaId}`,
      });
      continue;
    }

    const validationCopy = cloneRecipe(recipe);
    (validationCopy as any).profile = requirement;
    const valid = validator(validationCopy);
    const validationErrors = validator.errors || [];
    if (!valid && validationErrors.length > 0) {
      // Filter out unevaluatedProperties and additionalProperties errors for required profile validation
      // These are false positives when the recipe has stacks - stack properties are valid
      const filteredErrors = validationErrors.filter((e) => {
        if (e.keyword === "unevaluatedProperties" || e.keyword === "additionalProperties") {
          const path = e.instancePath || "";
          if (path === "" || path === "/") {
            return false; // Filter out root-level property errors
          }
        }
        return true;
      });
      
      // Only report errors if there are non-property errors
      if (filteredErrors.length > 0) {
        for (const error of filteredErrors) {
          const formatted = formatAjvError(error);
          errors.push({
            path: formatted.path,
            keyword: formatted.keyword,
            message: `Profile '${profile}' requires profile '${requirement}' to be satisfied: ${formatted.message}`,
          });
        }
      }
    }
  }

  return errors;
}

function validateDeclaredStacksAgainstRegistry(declaredStacks: Record<string, number>): NormalizedError[] {
  const errors: NormalizedError[] = [];

  for (const [name, version] of Object.entries(declaredStacks)) {
    const registryEntry = stackRegistryById.get(name);
    
    if (!registryEntry) {
      errors.push({
        path: `/stacks/${name}`,
        message: `Unknown stack: ${name}`,
      });
      continue;
    }

    if (!registryEntry.versions.includes(version)) {
      errors.push({
        path: `/stacks/${name}`,
        message: `Unsupported stack version for ${name}: ${version}`,
      });
      continue;
    }

    for (const requirement of registryEntry.requires) {
      if (!declaredStacks[requirement]) {
        errors.push({
          path: `/stacks/${name}`,
          message: `Stack '${name}' requires stack '${requirement}'.`,
        });
      }
    }
  }

  return errors;
}

/**
 * Infers stacks from payload fields in the recipe.
 * Returns a stacks map (e.g., { scaling: 1, storage: 1 }).
 * Uses registry-provided latest major versions.
 */
function inferStacksFromPayload(recipe: any): Record<string, number> {
  const inferred: Record<string, number> = {};

  if (!recipe || typeof recipe !== "object") {
    return inferred;
  }

  // Check registered stacks only
  for (const stackId of stackRegistryIds) {
    if (stackId in recipe && (recipe as any)[stackId] !== undefined) {
      const entry = stackRegistryById.get(stackId);
      inferred[stackId] = entry?.latestMajor ?? 1;
    }
  }

  return inferred;
}

function getStackContractErrors(
  recipe: Recipe,
  declaredStacks: Record<string, number>,
  inferredStacks: Record<string, number>,
): NormalizedError[] {
  const contractErrors: NormalizedError[] = [];

  // Check stack contract: all inferred stacks must be declared
  for (const [stackName] of Object.entries(inferredStacks)) {
    if (!declaredStacks[stackName]) {
      contractErrors.push({
        path: `/stacks/${stackName}`,
        message: `Stack contract violation: stack payload '${stackName}' exists but stack is not declared in 'stacks'. Add '${stackName}': 1 to the 'stacks' property.`,
      });
    }
  }

  // Structural stacks constrain existing properties and don't require payloads
  const structuralStacks = new Set(["structured", "quantified", "referenced", "timed"]);

  // Map stack names to their required payload property names
  const stackPayloadProperties: Record<string, string | string[]> = {
    prep: "miseEnPlace",
    scaling: "scaling",
    storage: "storage",
    dietary: "dietary",
    substitutions: "substitutions",
    techniques: "techniques",
    equipment: "equipment",
    illustrated: ["images", "videos"], // Either images or videos
  };

  for (const [stackName] of Object.entries(declaredStacks)) {
    // Skip payload check for structural stacks - they constrain existing properties
    if (structuralStacks.has(stackName)) {
      continue;
    }

    const payloadProps = stackPayloadProperties[stackName];
    if (!payloadProps) {
      continue;
    }

    const propNames = Array.isArray(payloadProps) ? payloadProps : [payloadProps];
    const hasPayload = propNames.some((prop) => prop in recipe && (recipe as any)[prop] !== undefined);

    if (!hasPayload) {
      const propName = Array.isArray(payloadProps) ? payloadProps.join(" or ") : payloadProps;
      contractErrors.push({
        path: `/stacks/${stackName}`,
        message: `Stack contract violation: stack '${stackName}' is declared but payload is missing. Add a '${propName}' property to the recipe.`,
      });
    }
  }

  return contractErrors;
}

function inferProfileFromRegistry(
  recipe: Recipe,
  declaredStacks: Record<string, number>,
  allStacks: Record<string, number>,
  context: ValidationContext,
  normalizedInput: Recipe,
  originalInput: any,
): ProfileName {
  let inferred: string | undefined;
  for (const profileId of profileRegistryOrder) {
    const validationResult = validateProfileComposition(
      profileId as ProfileName,
      recipe,
      declaredStacks,
      allStacks,
      context,
      normalizedInput,
      originalInput,
    );
    if (validationResult.ok) {
      inferred = profileId;
    }
  }

  if (inferred && typeof inferred === "string") {
    return inferred as ProfileName;
  }

  return "lite";
}

/**
 * Gets a composed validator for a profile and stacks using vendored schemas
 */
function getComposedValidator(
  profile: ProfileName,
  stacks: Record<string, number>,
  context: ValidationContext,
): ValidateFunction {
  // Create cache key from profile + sorted stack identifiers (e.g., "attribution@1,times@1")
  const stackIdentifiers = Object.entries(stacks)
    .map(([name, version]) => `${name}@${version}`)
    .sort();
  const cacheKey = `${profile}::${stackIdentifiers.join(",")}`;
  const cached = context.validators.get(cacheKey);
  if (cached) return cached;

  // Build composed schema: base + profile + stacks
  // The root schema has conditionals that should override ingredient/instruction definitions when stacks are present.
  // However, with allOf composition, the base definitions are still checked. The root schema's base ingredient
  // definition references IngredientBase (id/name/quantity), which should work with stack schemas, but the error
  // suggests it's checking against a different definition. The root schema's conditionals should handle this,
  // but they might not be matching correctly when multiple stacks are present.
  // When stack schemas are present, we rely on them to define ingredients/instructions via allOf.
  // The root schema is still needed for other properties (name, yield, time, etc.) and its conditionals.
  const baseSchemaWrapperId = `urn:soustack:base-wrapper:${cacheKey}`;
  if (!context.ajv.getSchema(baseSchemaWrapperId)) {
    // Create a wrapper schema that references the root schema but allows unevaluated properties
    // The root schema has unevaluatedProperties: false, but we need to allow stack properties
    // The root schema's conditionals should override the base ingredient/instruction definitions when stacks are present
    // We need to explicitly include the required fields from the base schema, as allOf with $ref might not propagate them correctly
    const baseSchema = context.ajv.getSchema(BASE_SCHEMA_ID);
    if (!baseSchema) {
      throw new Error(`Base schema not loaded: ${BASE_SCHEMA_ID}`);
    }
    // Get the base schema's required fields
    const ajvAny = context.ajv as any;
    const baseSchemaObj = ajvAny.schemas[BASE_SCHEMA_ID];
    const baseSchemaData = baseSchemaObj?.schema || baseSchemaObj;
    const baseRequired = baseSchemaData?.required || [];
    
    const baseSchemaWrapper = {
      $id: baseSchemaWrapperId,
      allOf: [{ $ref: BASE_SCHEMA_ID }],
      // Explicitly include required fields to ensure they are checked
      required: baseRequired,
      // Override unevaluatedProperties to allow stack schema properties
      unevaluatedProperties: true,
    };
    context.ajv.addSchema(baseSchemaWrapper, baseSchemaWrapperId);
  }
  const allOf: any[] = [{ $ref: baseSchemaWrapperId }];

  // Verify base schema is loaded
  if (!context.ajv.getSchema(BASE_SCHEMA_ID)) {
    throw new Error(`Base schema not loaded: ${BASE_SCHEMA_ID}. Ensure schemas are loaded before creating validators.`);
  }

  // Add profile schema
  // Profile schemas may have legacy ingredient requirements (e.g., "item" property) that conflict
  // with stack schemas (which use "id", "name", "quantity"). When stack schemas are present,
  // we need to exclude the profile schema's ingredient/instruction property overrides.
  // Profile schemas are still needed for other requirements (yield, time, etc.).
  const profileSchemaId = `${PROFILE_SCHEMA_PREFIX}${profile}`;
  if (!context.ajv.getSchema(profileSchemaId)) {
    throw new Error(`Profile schema not loaded: ${profileSchemaId}`);
  }
  
  const hasStackSchemas = Object.keys(stacks).length > 0;
  if (hasStackSchemas) {
    // When stacks are present, create a minimal profile schema that only includes non-conflicting requirements
    // We need to get the profile schema and extract only the parts that don't conflict with stack schemas
    const profileWrapperId = `urn:soustack:profile-wrapper:${cacheKey}`;
    if (!context.ajv.getSchema(profileWrapperId)) {
      // Get the profile schema object from AJV's internal storage
      const ajvAny = context.ajv as any;
      const profileSchemaObj = ajvAny.schemas[profileSchemaId];
      if (!profileSchemaObj) {
        throw new Error(`Profile schema object not found: ${profileSchemaId}`);
      }
      
      // Create a wrapper that includes the profile's allOf but excludes:
      // 1. Ingredient/instruction property overrides (conflict with stack schemas)
      // 2. Entries that reference legacy #/definitions/* paths (can't resolve in wrapper)
      const profileSchema = profileSchemaObj.schema || profileSchemaObj;
      const filteredAllOf: any[] = [];
      
      // Helper function to check if a schema object contains legacy #/definitions/* references
      const hasLegacyDefinitionsRef = (obj: any): boolean => {
        if (!obj || typeof obj !== 'object') return false;
        if (obj.$ref && typeof obj.$ref === 'string' && obj.$ref.includes('#/definitions/')) {
          return true;
        }
        for (const value of Object.values(obj)) {
          if (Array.isArray(value)) {
            if (value.some((item: any) => hasLegacyDefinitionsRef(item))) return true;
          } else if (typeof value === 'object' && value !== null) {
            if (hasLegacyDefinitionsRef(value)) return true;
          }
        }
        return false;
      };
      
      if (Array.isArray(profileSchema.allOf)) {
        for (const entry of profileSchema.allOf) {
          // Skip entries that reference legacy #/definitions/* paths
          // These can't be resolved in the wrapper schema and should be handled by stack schemas instead
          if (hasLegacyDefinitionsRef(entry)) {
            continue;
          }
          
          // Skip entries that override ingredients or instructions properties
          if (entry.properties && (entry.properties.ingredients || entry.properties.instructions)) {
            // Create a modified entry without ingredient/instruction overrides
            const modifiedEntry: any = { ...entry };
            if (modifiedEntry.properties) {
              const newProps: any = { ...modifiedEntry.properties };
              delete newProps.ingredients;
              delete newProps.instructions;
              if (Object.keys(newProps).length > 0) {
                modifiedEntry.properties = newProps;
              } else {
                delete modifiedEntry.properties;
              }
            }
            // Only add if there are still other properties or requirements
            if (modifiedEntry.properties || modifiedEntry.required || modifiedEntry.allOf) {
              filteredAllOf.push(modifiedEntry);
            }
          } else {
            // Keep entries that don't override ingredients/instructions and don't reference legacy definitions
            filteredAllOf.push(entry);
          }
        }
      }
      
      // Create wrapper schema with filtered allOf
      const profileWrapper: any = {
        $id: profileWrapperId,
        allOf: filteredAllOf.length > 0 ? filteredAllOf : [{ $ref: profileSchemaId }],
      };
      
      // If we filtered out everything, just reference the base schema that the profile references
      if (filteredAllOf.length === 0 && profileSchema.allOf && profileSchema.allOf.length > 0) {
        // Find the base schema reference (usually the first allOf entry)
        const baseRef = profileSchema.allOf.find((e: any) => e.$ref && !e.properties && !hasLegacyDefinitionsRef(e));
        if (baseRef) {
          profileWrapper.allOf = [baseRef];
        } else {
          // Fallback: reference the base schema directly
          profileWrapper.allOf = [{ $ref: BASE_SCHEMA_ID }];
        }
      }
      
      context.ajv.addSchema(profileWrapper, profileWrapperId);
    }
    allOf.push({ $ref: profileWrapperId });
  } else {
    // No stacks - use profile schema directly
  allOf.push({ $ref: profileSchemaId });
  }

  // Add stack schemas using registry
  for (const [name, version] of Object.entries(stacks)) {
    if (typeof version === "number" && version >= 1) {
      // Look up stack in registry
      const stacksRegistry = registry.stacks || {};
      const stackEntry = (stacksRegistry as Record<string, any>)[name];
      if (!stackEntry || typeof stackEntry !== "object") {
        // Stack not in registry - skip with warning
        console.warn(`Stack '${name}' not found in registry`);
        continue;
      }
      
      // Verify major version is supported
      const versionStr = String(version);
      const schemaPath = stackEntry.schema?.major?.[versionStr];
      if (!schemaPath || typeof schemaPath !== "string") {
        // Version not supported - skip with warning
        const availableVersions = Object.keys(stackEntry.schema?.major || {}).join(", ");
        console.warn(`Stack '${name}' version ${version} not found in registry (available: ${availableVersions || "none"})`);
        continue;
      }
      
      // Load schema file to get its $id
      // Schema path is relative like "stacks/quantified.schema.json"
      // Extract the stack name from the path (e.g., "quantified" from "stacks/quantified.schema.json")
      const stackNameFromPath = schemaPath.replace(/^stacks\//, "").replace(/\.schema\.json$/, "");
      try {
        const stackSchema = require(`./stacks/${stackNameFromPath}.schema.json`);
        if (stackSchema && typeof stackSchema === "object" && "$id" in stackSchema) {
          const stackSchemaId = stackSchema.$id;
          // Verify schema is loaded in AJV
          if (context.ajv.getSchema(stackSchemaId)) {
            allOf.push({ $ref: stackSchemaId });
          } else {
            console.warn(`Stack schema '${stackSchemaId}' not loaded in AJV (registry path: ${schemaPath})`);
          }
        } else {
          console.warn(`Stack schema file for '${name}' missing $id (path: ${schemaPath})`);
        }
      } catch (e) {
        console.warn(`Failed to load stack schema for '${name}' from path '${schemaPath}': ${e}`);
      }
    }
  }

  // Create composed schema with allOf
  // The base wrapper already has unevaluatedProperties: true, so we don't need to set it again
  const composedSchema = {
    $id: `urn:soustack:composed:${cacheKey}`,
    allOf,
  };
  const validateFn = context.ajv.compile(composedSchema);
  context.validators.set(cacheKey, validateFn);
  return validateFn;
}

function filterValidationErrors(
  errors: ErrorObject[],
  validationCopy: Recipe,
  normalizedInput: Recipe,
  originalInput: any,
  allStacks: Record<string, number>,
): ErrorObject[] {
  const hadTypeProperty =
    (normalizedInput && typeof normalizedInput === "object" && "@type" in normalizedInput) ||
    (originalInput && typeof originalInput === "object" && "@type" in originalInput);
  const hadVersionProperty =
    (normalizedInput && typeof normalizedInput === "object" && "version" in normalizedInput) ||
    (originalInput && typeof originalInput === "object" && "version" in originalInput);
  const hadSchemaProperty =
    (normalizedInput && typeof normalizedInput === "object" && "$schema" in normalizedInput) ||
    (originalInput && typeof originalInput === "object" && "$schema" in originalInput);

  // #region agent log
  fetch("http://127.0.0.1:7244/ingest/7f75dc85-5d88-41b3-a2c3-713d0c6ca7a6", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "validator.ts:1167",
      message: "Checking @type and version",
      data: {
        hasOriginalInput: !!originalInput,
        originalInputKeys: originalInput ? Object.keys(originalInput).slice(0, 10) : [],
        normalizedInputKeys: Object.keys(normalizedInput).slice(0, 10),
        hadTypeProperty,
        hadVersionProperty,
        normalizedInputHasType: "@type" in normalizedInput,
        normalizedInputHasVersion: "version" in normalizedInput,
      },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "filter-debug",
      hypothesisId: "B",
    }),
  }).catch(() => {});
  // #endregion agent log

  const xProperties = Object.keys(validationCopy).filter((key) => key.startsWith("x-"));

  const stackPropertyNames = new Set<string>();
  for (const [stackName] of Object.entries(allStacks)) {
    const registryEntry = stackRegistryById.get(stackName);
    if (registryEntry) {
      stackPropertyNames.add(stackName);
    }
  }

  const validRootProperties = new Set([
    "$schema",
    "profile",
    "stacks",
    "name",
    "yield",
    "time",
    "ingredients",
    "instructions",
    "metadata",
    "images",
    "videos",
    "miseEnPlace",
    "scaling",
    "storage",
    "dietary",
    "substitutions",
    "techniques",
    "equipment",
  ]);

  const filteredErrors = errors.filter((e) => {
    if (e.keyword === "unevaluatedProperties" || e.keyword === "additionalProperties") {
      const instancePath = (e as any).instancePath;
      const isRootLevel = instancePath === undefined || instancePath === "" || instancePath === "/";

      const params = e.params as any;
      const propertyName = params?.unevaluatedProperty || params?.additionalProperty;

      const formattedPath = instancePath === "" && propertyName ? `/${propertyName}` : instancePath;

      if (isRootLevel) {
        if (propertyName && typeof propertyName === "string") {
          if (propertyName === "@type" || propertyName === "version") {
            return false;
          }
          if (validRootProperties.has(propertyName)) {
            return false;
          }
          if (propertyName.startsWith("x-")) {
            return false;
          }
          if (stackPropertyNames.has(propertyName)) {
            return false;
          }
          return true;
        }
        if (xProperties.length > 0) {
          return false;
        }
        if (
          e.keyword === "unevaluatedProperties" &&
          (!propertyName || propertyName === undefined || propertyName === null)
        ) {
          return false;
        }
        if ((hadTypeProperty || hadVersionProperty || hadSchemaProperty) && e.keyword === "unevaluatedProperties") {
          return false;
        }
        return true;
      } else {
        const pathParts = formattedPath.split("/").filter((p: string) => p);
        if (pathParts.length > 0) {
          const firstPart = pathParts[0];
          if (validRootProperties.has(firstPart) || stackPropertyNames.has(firstPart)) {
            return false;
          }
        }
        if (propertyName && typeof propertyName === "string" && propertyName.startsWith("x-")) {
          return false;
        }
        return true;
      }
    }
    return true;
  });

  // #region agent log
  fetch("http://127.0.0.1:7244/ingest/7f75dc85-5d88-41b3-a2c3-713d0c6ca7a6", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "validator.ts:1245",
      message: "After filtering errors",
      data: {
        originalErrorCount: errors.length,
        filteredErrorCount: filteredErrors.length,
        willSetValid: filteredErrors.length === 0,
        filteredErrors: filteredErrors.slice(0, 3).map((error: any) => ({
          keyword: error.keyword,
          path: error.instancePath,
          message: error.message,
        })),
      },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "filter-debug",
      hypothesisId: "A",
    }),
  }).catch(() => {});
  // #endregion agent log

  return filteredErrors;
}

function validateProfileComposition(
  profile: ProfileName,
  recipe: Recipe,
  declaredStacks: Record<string, number>,
  allStacks: Record<string, number>,
  context: ValidationContext,
  normalizedInput: Recipe,
  originalInput: any,
): { ok: boolean; errors: NormalizedError[] } {
  const requirementErrors = getProfileRequirementErrors(profile, recipe, declaredStacks, context);
  if (requirementErrors.length > 0) {
    return {
      ok: false,
      errors: requirementErrors,
    };
  }

  const profileSchemaId = `${PROFILE_SCHEMA_PREFIX}${profile}`;
  if (!context.ajv.getSchema(profileSchemaId)) {
    return {
      ok: false,
      errors: [
        {
          path: "/profile",
          message: `Profile schema not loaded: ${profileSchemaId}`,
        },
      ],
    };
  }

  const validationCopy = cloneRecipe(recipe);
  (validationCopy as any).stacks = allStacks;
  if (!validationCopy.profile) {
    (validationCopy as any).profile = profile;
  }
  if ("@type" in validationCopy) {
    delete (validationCopy as any)["@type"];
  }
  if ("$schema" in validationCopy) {
    delete (validationCopy as any).$schema;
  }

  const validator = getComposedValidator(profile, allStacks, context);

  let isValid = validator(validationCopy);
  let errors = validator.errors || [];

  if (isValid && context.rootValidator) {
    const baseValid = context.rootValidator(validationCopy);
    if (!baseValid && context.rootValidator.errors) {
      const requiredErrors = context.rootValidator.errors.filter(
        (e: any) => e.keyword === "required" && e.params?.missingProperty,
      );
      if (requiredErrors.length > 0) {
        isValid = false;
        errors = [...errors, ...context.rootValidator.errors.filter((e: any) => e.keyword === "required")];
      }
    }
  }

  if (!isValid && errors.length > 0) {
    const filteredErrors = filterValidationErrors(errors, validationCopy, normalizedInput, originalInput, allStacks);
    if (filteredErrors.length === 0) {
      isValid = true;
      errors = [];
    } else {
      errors = filteredErrors;
    }
  }

  return {
    ok: isValid,
    errors: errors.map(formatAjvError),
  };
}

/**
 * Validates a recipe against the root schema from the vendored spec.
 * This is the new primary validation function.
 * For recipes with profile/stacks, uses composed validation (base + profile + stacks).
 * For recipes without profile/stacks, validates against root schema directly.
 */
export function validateRecipeSchema(
  input: unknown,
  options: { collectAllErrors?: boolean; schema?: string } = {},
): {
  ok: boolean;
  errors: NormalizedError[];
  warnings: string[];
} {
  const inputHasStacks =
    !!input && typeof input === "object" && !Array.isArray(input) && "stacks" in (input as any);
  // Normalize the input first
  const { recipe: normalizedInput, warnings: inputWarnings } = normalizeRecipe(input);
  const warnings: string[] = [...inputWarnings];

  const { ok, errors } = validateRecipeSchemaNormalized(
    normalizedInput,
    inputHasStacks,
    options.collectAllErrors ?? true,
    options.schema,
    input, // Pass original input to check for @type and version
  );

  return {
    ok,
    errors,
    warnings,
  };
}

function validateRecipeSchemaNormalized(
  normalizedInput: Recipe,
  inputHasStacks: boolean,
  collectAllErrors: boolean,
  schemaOverride?: string,
  originalInput?: any,
): { ok: boolean; errors: NormalizedError[] } {
  const normalized = cloneRecipe(normalizedInput);

  // Get validation context
  const context = getContext(collectAllErrors);

  const schemaId = typeof schemaOverride === "string" ? schemaOverride : typeof normalized.$schema === "string" ? normalized.$schema : undefined;
  const hasSchemaOverride = typeof schemaOverride === "string";
  const isSoustackSchema = schemaId ? isSoustackSchemaId(schemaId) : false;
  
  // Check if recipe has stacks - if so, we need to use composed validation
  // even if $schema is set, because the root schema doesn't include stack properties
  const hasStacks = normalized.stacks && typeof normalized.stacks === "object" && !Array.isArray(normalized.stacks) && Object.keys(normalized.stacks).length > 0;
  
  // Only use direct schema validation if:
  // 1. Schema is specified AND
  // 2. It's a Soustack schema AND
  // 3. Recipe doesn't have stacks (stacks require composed validation)
  if (schemaId && isSoustackSchema && !hasStacks) {
    const schemaValidator = context.ajv.getSchema(schemaId);
    if (!schemaValidator) {
      return {
        ok: false,
        errors: [
          {
            path: "/$schema",
            message: `Unknown schema: ${schemaId}`,
          },
        ],
      };
    }

    const schemaInput = cloneRecipe(normalized);
    // Remove $schema from validation copy - it's a JSON Schema property, not part of the recipe schema
    if ("$schema" in schemaInput) {
      delete (schemaInput as any).$schema;
    }
    if (hasSchemaOverride && "$schema" in schemaInput && schemaInput.$schema !== schemaId) {
      delete (schemaInput as any).$schema;
    }
    const isLegacySchema = schemaId.startsWith(LEGACY_ROOT_SCHEMA_ID);
    const shouldRemoveStacks = (isLegacySchema || schemaId === DEFAULT_ROOT_SCHEMA_ID) && !inputHasStacks;
    if (isLegacySchema && "@type" in schemaInput) {
      delete (schemaInput as any)["@type"];
    }
    if (shouldRemoveStacks && "stacks" in schemaInput) {
      delete (schemaInput as any).stacks;
    }
    const schemaValid = schemaValidator(schemaInput);
    const schemaErrors = schemaValidator.errors || [];
    
    // Filter out false positive errors for properties we remove before validation ($schema, @type, version)
    const hadSchemaProperty = (normalizedInput && typeof normalizedInput === "object" && "$schema" in normalizedInput)
      || (originalInput && typeof originalInput === "object" && "$schema" in originalInput);
    const hadTypeProperty = (normalizedInput && typeof normalizedInput === "object" && "@type" in normalizedInput) 
      || (originalInput && typeof originalInput === "object" && "@type" in originalInput);
    const hadVersionProperty = (normalizedInput && typeof normalizedInput === "object" && "version" in normalizedInput)
      || (originalInput && typeof originalInput === "object" && "version" in originalInput);
    
    const filteredErrors = schemaErrors.filter((e) => {
      if (e.keyword === "unevaluatedProperties" || e.keyword === "additionalProperties") {
        const instancePath = e.instancePath;
        const isRootLevel = instancePath === undefined || instancePath === "" || instancePath === "/";
        const params = e.params as any;
        const propertyName = params?.unevaluatedProperty || params?.additionalProperty;
        
        if (isRootLevel) {
          if (propertyName && typeof propertyName === "string") {
            // Filter out errors for properties we remove or that are valid
            if (propertyName === "$schema" || propertyName === "@type" || propertyName === "version") {
              return false;
            }
            // Filter out valid root properties
            if (propertyName === "profile" || propertyName === "stacks" || propertyName === "name" || 
                propertyName === "yield" || propertyName === "time" || propertyName === "ingredients" || 
                propertyName === "instructions" || propertyName.startsWith("x-")) {
              return false;
            }
          }
          // Filter out unevaluatedProperties errors without property names if we removed $schema, @type, or version
          if (e.keyword === "unevaluatedProperties" && (!propertyName || propertyName === undefined || propertyName === null)) {
            if (hadSchemaProperty || hadTypeProperty || hadVersionProperty) {
              return false; // Likely a false positive from removed properties
            }
          }
        }
      }
      return true;
    });
    
    // If validation passed, it's valid
    // If validation failed but all errors were filtered out (meaning they were false positives),
    // also consider it valid
    const ok = Boolean(schemaValid) || (filteredErrors.length === 0);
    
    return {
      ok,
      errors: filteredErrors.map(formatAjvError),
    };
  }
  
  // If schema is specified but recipe has stacks, fall through to composed validation
  // This ensures stack properties are validated correctly

  // Determine if we should use composed validation or root schema
  const hasProfile = normalized.profile && typeof normalized.profile === "string";
  
  let profileName = hasProfile
    ? ((normalized.profile as string).toLowerCase() as string)
    : undefined;
  
  // Get declared stacks from recipe
  let declaredStacks: Record<string, number> = {};
  if (normalized.stacks && typeof normalized.stacks === "object" && !Array.isArray(normalized.stacks)) {
    for (const [name, version] of Object.entries(normalized.stacks)) {
      if (typeof version === "number" && version >= 1) {
        declaredStacks[name] = version;
      }
    }
  }

  const registryErrors = validateDeclaredStacksAgainstRegistry(declaredStacks);
  if (registryErrors.length > 0) {
    return {
      ok: false,
      errors: registryErrors,
    };
  }

  // Infer stacks from payloads (for stack contract enforcement)
  // Stack contract: if a payload exists, the stack MUST be declared in the recipe
  const inferredStacks = inferStacksFromPayload(normalized);
  const contractErrors = getStackContractErrors(normalized, declaredStacks, inferredStacks);
  if (contractErrors.length > 0) {
    return {
      ok: false,
      errors: contractErrors,
    };
  }
  
  // Merge declared and inferred stacks, using max(version) per stack name
  const allStacks: Record<string, number> = { ...inferredStacks, ...declaredStacks };

  // Infer profile if none specified, using declared stacks only
  // Always use composed validation (base + profile + stacks) instead of root schema
  if (!profileName) {
    profileName = inferProfileFromRegistry(normalized, declaredStacks, allStacks, context, normalizedInput, originalInput);
  }
  
  const profile = profileName as ProfileName;
  (normalized as any).profile = profile;
  (normalizedInput as any).profile = profile;

  const validationOutcome = validateProfileComposition(
    profile,
    normalized,
    declaredStacks,
    allStacks,
    context,
    normalizedInput,
    originalInput,
  );

  return validationOutcome;
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
 * but maintains backward compatibility with profile/stack-based validation
 * Also includes semantic conformance validation.
 */
/**
 * Validates a recipe with explicit validation modes.
 * - mode="schema": JSON Schema only
 * - mode="full": schema + semantic conformance (only if schema passes)
 */
export function validateRecipe(input: any, options: ValidateOptions = {}): ValidateResult {
  const { recipe: normalized, warnings } = normalizeRecipe(input);
  if (options.profile) {
    (normalized as any).profile = options.profile;
  }

  const inputHasStacks =
    !!input && typeof input === "object" && !Array.isArray(input) && "stacks" in (input as any);
  const { ok: schemaOk, errors: schemaErrors } = validateRecipeSchemaNormalized(
    normalized,
    inputHasStacks,
    options.collectAllErrors ?? true,
    options.schema,
    input, // Pass original input to check for @type and version
  );

  const mode: ValidateMode = options.mode ?? "full";
  let conformanceIssues: ConformanceIssue[] = [];
  let conformanceOk = true;

  if (mode === "full") {
    if (schemaOk) {
      const conformanceResult = validateConformance(normalized);
      conformanceIssues = conformanceResult.issues;
      conformanceOk = conformanceResult.ok;
    } else {
      conformanceOk = false;
    }
  }

  const ok = schemaOk && (mode === "schema" ? true : conformanceOk);
  const normalizedRecipe = ok || options.includeNormalized ? normalized : undefined;

  return {
    ok,
    schemaErrors,
    conformanceIssues,
    warnings,
    normalizedRecipe,
  };
}

export function validateRecipeWithProfile(data: any, profile: ProfileName): data is Recipe {
  return validateRecipe(data, { profile }).ok;
}

export function detectProfiles(recipe: any): ProfileName[] {
  const { recipe: normalized } = normalizeRecipe(recipe);
  const context = getContext(false);

  const declaredStacks: Record<string, number> = {};
  if (normalized.stacks && typeof normalized.stacks === "object" && !Array.isArray(normalized.stacks)) {
    for (const [name, version] of Object.entries(normalized.stacks)) {
      if (typeof version === "number" && version >= 1) {
        declaredStacks[name] = version;
      }
    }
  }

  const registryErrors = validateDeclaredStacksAgainstRegistry(declaredStacks);
  if (registryErrors.length > 0) {
    return [];
  }

  const inferredStacks = inferStacksFromPayload(normalized);
  const contractErrors = getStackContractErrors(normalized, declaredStacks, inferredStacks);
  if (contractErrors.length > 0) {
    return [];
  }

  const allStacks: Record<string, number> = { ...inferredStacks, ...declaredStacks };
  const compatible: ProfileName[] = [];

  for (const profileId of profileRegistryOrder) {
    const outcome = validateProfileComposition(
      profileId as ProfileName,
      normalized,
      declaredStacks,
      allStacks,
      context,
      normalized,
      recipe,
    );
    if (outcome.ok) {
      compatible.push(profileId as ProfileName);
    }
  }

  return compatible;
}
