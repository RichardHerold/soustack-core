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
import { CANONICAL_SCHEMA_ID, CANONICAL_ROOT_SCHEMA_URL, LEGACY_SCHEMA_ID, resolveSchemaHint, SCHEMA_ALIAS_MAP } from "./schemaMetadata";

type ProfileName =
  | "base"
  | "equipped"
  | "illustrated"
  | "lite"
  | "prepped"
  | "scalable"
  | "timed";

// Schema IDs from the vendored spec
const LEGACY_ROOT_SCHEMA_ID = LEGACY_SCHEMA_ID;
const DEFAULT_ROOT_SCHEMA_ID = CANONICAL_SCHEMA_ID;
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
const stackSchemaIdCache: Map<string, string> = new Map();

const optionalRequire = (id: string): any => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return typeof require === "function" ? require(id) : null;
  } catch {
    return null;
  }
};

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
  const stackLoading = new Set<string>();
  for (const [id, entry] of Object.entries(stacks)) {
    if (!entry || typeof entry !== "object") continue;
    const majors = entry.schema?.major && typeof entry.schema.major === "object" ? Object.keys(entry.schema.major) : [];
    for (const majorKey of majors) {
      const major = parseInt(majorKey, 10);
      if (!Number.isInteger(major) || major < 1) continue;
      ensureStackSchemaLoaded(ajv, id, major, stackLoading);
    }
  }

  // Load root schema (references defs and stack schemas)
  if (rootSchema && typeof rootSchema === "object" && "$id" in rootSchema) {
    const rootSchemaId = (rootSchema as { $id?: string }).$id;
    if (rootSchemaId) {
      // Register the schema with its vendored ID
      if (!ajv.getSchema(rootSchemaId)) {
        ajv.addSchema(rootSchema, rootSchemaId);
      }
      // Note: We don't create a $ref alias for canonical ID here because it breaks relative refs.
      // Instead, we handle canonical URL normalization in resolveSchemaHint and use vendored ID for Ajv lookups.
    }
  }

  // Create legacy schema mappings BEFORE alias registration and profile loading
  // This ensures compatibility schemas with definitions are created before aliases
  // Profiles reference http://soustack.org/schema/v0.0.2, but root schema uses https://spec.soustack.org/soustack.schema.json
  // We need to create a mapping from the legacy ID to the root schema
  // Also need to map old #/definitions/ to new #/$defs/ for backward compatibility
  // Profile schemas use Draft 7 which uses "definitions", but they reference a Draft 2020-12 schema
  // We need to create a compatibility layer that exposes definitions in the old format
  const rootSchemaIdForCompat = (rootSchema as { $id?: string }).$id ?? DEFAULT_ROOT_SCHEMA_ID;
  const legacyIds = Array.from(
    new Set<string>([
      LEGACY_ROOT_SCHEMA_ID,
      `http://soustack.org/schema/v0.0.2`, // Profiles reference this version
    ]),
  );
  
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
          instruction: { $ref: `${rootSchemaIdForCompat}#/$defs/step` },
          instructionSubsection: { $ref: `${rootSchemaIdForCompat}#/$defs/stepSection` },
          ingredient: { $ref: `${rootSchemaIdForCompat}#/$defs/ingredient` },
          ingredientSection: { $ref: `${rootSchemaIdForCompat}#/$defs/ingredientSection` },
          ingredientSubsection: { $ref: `${rootSchemaIdForCompat}#/$defs/ingredientSection` }, // Alias for ingredientSection
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
              "^x-": { $ref: "https://spec.soustack.org/defs/common.schema.json#/properties/extensionLaneValue" },
            },
          },
          time: {
            type: "object",
            properties: {
              total: { $ref: "https://spec.soustack.org/defs/duration.schema.json#/properties/DurationMinutes" },
              metadata: { type: "object", additionalProperties: true },
            },
            required: ["total"],
            additionalProperties: false,
            patternProperties: {
              "^x-": { $ref: "https://spec.soustack.org/defs/common.schema.json#/properties/extensionLaneValue" },
            },
          },
          quantity: { $ref: `https://spec.soustack.org/defs/quantity.schema.json` },
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

  // Register alias IDs that should resolve to the vendored root schema
  // Note: We use vendored ID as target (not canonical) to avoid $ref chain issues
  // IMPORTANT: This runs AFTER compatibility schema creation to avoid creating aliases
  // that would prevent the compatibility schema from being created
  const rootSchemaIdForAliases = (rootSchema as { $id?: string }).$id;
  for (const [alias, target] of SCHEMA_ALIAS_MAP.entries()) {
    if (alias === target) continue;
    // Skip if alias is the vendored root schema ID (already registered above)
    if (rootSchemaIdForAliases && alias === rootSchemaIdForAliases) continue;
    // Skip canonical ID - we handle it via schemaIdForLookup in validation
    if (alias === CANONICAL_SCHEMA_ID) continue;
    // Skip legacy IDs that we've already created compatibility schemas for
    if (alias === LEGACY_ROOT_SCHEMA_ID || alias === `http://soustack.org/schema/v0.0.2`) continue;
    if (!ajv.getSchema(alias)) {
      // Create a reference schema that points to the vendored schema (or target if vendored not available)
      const targetId = (target === CANONICAL_SCHEMA_ID && rootSchemaIdForAliases) ? rootSchemaIdForAliases : target;
      if (targetId && ajv.getSchema(targetId)) {
        ajv.addSchema({ $id: alias, $ref: targetId }, alias);
      }
    }
  }

  // Load profile schemas
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
  // Use vendored schema ID (not canonical or legacy) since that's what's actually registered
  const rootSchemaId = (rootSchema as { $id?: string }).$id;
  const rootValidator = ajv.getSchema(rootSchemaId ?? '') || ajv.getSchema(DEFAULT_ROOT_SCHEMA_ID) || ajv.getSchema(LEGACY_ROOT_SCHEMA_ID);
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
  return resolveSchemaHint(schemaId).isSoustackSchema;
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

function resolveStackSchemaPath(stackId: string, major: number): { path: string; requires: string[] } | null {
  const stacks = registry.stacks || {};
  const entry = (stacks as Record<string, any>)[stackId];
  if (!entry || typeof entry !== "object") return null;

  const versionKey = String(major);
  const schemaPath = entry.schema?.major?.[versionKey];
  if (typeof schemaPath !== "string") return null;

  const requires = Array.isArray(entry.requires)
    ? entry.requires.filter((value: unknown): value is string => typeof value === "string")
    : [];

  return {
    path: schemaPath.replace(/^\.\//, ""),
    requires,
  };
}

function resolveStackSchemaRefs(schema: any): any {
  const resolvedSchema = JSON.parse(JSON.stringify(schema)); // Deep clone
  const resolveRefs = (obj: any): void => {
    if (Array.isArray(obj)) {
      obj.forEach(resolveRefs);
    } else if (obj && typeof obj === "object") {
      for (const [key, value] of Object.entries(obj)) {
        if (key === "$ref" && typeof value === "string") {
          if (value.startsWith("./") || value.startsWith("../stacks/")) {
            const [refPath, fragment] = value.split("#");
            const refName = refPath?.replace(/^(\.\/|\.{2}\/stacks\/)/, "").replace(/\.schema\.json$/, "");
            if (refName) {
              const refId = `https://spec.soustack.org/stacks/${refName}.schema.json${fragment ? `#${fragment}` : ""}`;
              obj[key] = refId;
            }
          }
        } else {
          resolveRefs(value);
        }
      }
    }
  };
  resolveRefs(resolvedSchema);
  return resolvedSchema;
}

function hasLegacyDefinitionsRef(obj: any): boolean {
  if (!obj || typeof obj !== "object") return false;
  if (obj.$ref && typeof obj.$ref === "string" && obj.$ref.includes("#/definitions/")) {
    return true;
  }
  return Object.values(obj).some((value) => {
    if (Array.isArray(value)) {
      return value.some((item) => hasLegacyDefinitionsRef(item));
    }
    if (value && typeof value === "object") {
      return hasLegacyDefinitionsRef(value);
    }
    return false;
  });
}

function hasLegacyProfileOrModuleRef(obj: any): boolean {
  if (!obj || typeof obj !== "object") return false;
  if (obj.$ref && typeof obj.$ref === "string") {
    if (
      obj.$ref.includes("soustack.org/schema/v0.0.2/profiles/") ||
      obj.$ref.includes("soustack.org/schema/v0.0.2/modules/")
    ) {
      return true;
    }
  }
  return Object.values(obj).some((value) => {
    if (Array.isArray(value)) {
      return value.some((item) => hasLegacyProfileOrModuleRef(item));
    }
    if (value && typeof value === "object") {
      return hasLegacyProfileOrModuleRef(value);
    }
    return false;
  });
}

function ensureStackSchemaLoaded(
  ajv: Ajv2020,
  stackId: string,
  major: number,
  loading: Set<string>,
): string | null {
  if (stackId.startsWith("x-")) return null; // Vendor stack - no schema enforcement

  const stackKey = `${stackId}@${major}`;
  if (loading.has(stackKey)) {
    return stackSchemaIdCache.get(stackKey) ?? null;
  }

  loading.add(stackKey);
  try {
    const resolved = resolveStackSchemaPath(stackId, major);
    if (!resolved) {
      throw new Error(`Stack schema not found in registry for '${stackId}' major ${major}`);
    }

    const { path: schemaPath, requires } = resolved;
    const normalizedSchemaPath = schemaPath.startsWith("./") ? schemaPath : `./${schemaPath}`;
    const fs = optionalRequire("fs") as typeof import("fs") | null;
    const path = optionalRequire("path") as typeof import("path") | null;
    const searchPaths: string[] = [];
    if (path) {
      searchPaths.push(
        path.join(__dirname, "..", "spec", schemaPath),
        path.join(process.cwd(), "spec", schemaPath),
        path.join(__dirname, schemaPath),
        path.join(__dirname, "..", "src", schemaPath),
        path.join(process.cwd(), schemaPath),
        path.join(process.cwd(), "src", schemaPath),
      );
    }
    const existingPath = fs && searchPaths.length > 0 ? searchPaths.find((candidate) => fs.existsSync(candidate)) : undefined;
    const requirePath = existingPath ?? normalizedSchemaPath;
    let stackSchema: any;
    try {
      stackSchema = require(requirePath);
    } catch (error) {
      console.warn(`Stack schema not found for ${stackId} (major ${major}): ${schemaPath}`);
      return null;
    }

    if (!stackSchema || typeof stackSchema !== "object" || !("$id" in stackSchema)) {
      console.warn(`Stack schema for ${stackId} (major ${major}) is missing $id (path: ${schemaPath})`);
      return null;
    }

    const resolvedSchema = resolveStackSchemaRefs(stackSchema);
    const schemaId = (resolvedSchema as { $id?: string }).$id;
    if (!schemaId) {
      console.warn(`Stack schema for ${stackId} (major ${major}) is missing $id after resolution (path: ${schemaPath})`);
      return null;
    }

    if (!ajv.getSchema(schemaId)) {
      const referencedStacks = new Set<string>();
      const collectStackRefs = (obj: any): void => {
        if (Array.isArray(obj)) {
          obj.forEach(collectStackRefs);
        } else if (obj && typeof obj === "object") {
          const refValue = (obj as any).$ref;
          if (typeof refValue === "string") {
            // Match both old domain (soustack.spec) and canonical domain (spec.soustack.org) for backward compatibility
            const match = refValue.match(/^https:\/\/(?:soustack\.spec|spec\.soustack\.org)\/stacks\/([^.#/]+)\.schema\.json/);
            if (match && match[1]) {
              referencedStacks.add(match[1]);
            }
          }
          Object.values(obj).forEach(collectStackRefs);
        }
      };
      collectStackRefs(resolvedSchema);

      for (const dep of requires) {
        const depMajor = stackRegistryById.get(dep)?.latestMajor ?? 1;
        ensureStackSchemaLoaded(ajv, dep, depMajor, loading);
      }
      for (const refStack of referencedStacks) {
        if (refStack === stackId) continue;
        const depMajor = stackRegistryById.get(refStack)?.latestMajor ?? 1;
        ensureStackSchemaLoaded(ajv, refStack, depMajor, loading);
      }
      ajv.addSchema(resolvedSchema, schemaId);
    }

    stackSchemaIdCache.set(stackKey, schemaId);
    return schemaId;
  } finally {
    loading.delete(stackKey);
  }
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
      if (name.startsWith("x-")) {
        continue; // Vendor stack - allowed without registry entry
      }
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

function getProfileWrapperSchemaId(
  context: ValidationContext,
  profileSchemaId: string,
  cacheKey: string,
  options: { removeIngredientInstructionOverrides: boolean },
): string {
  const wrapperSuffix = options.removeIngredientInstructionOverrides ? "with-stacks" : "no-stacks";
  const profileWrapperId = `urn:soustack:profile-wrapper:${cacheKey}:${wrapperSuffix}`;
  if (context.ajv.getSchema(profileWrapperId)) {
    return profileWrapperId;
  }

  const ajvAny = context.ajv as any;
  const profileSchemaObj = ajvAny.schemas[profileSchemaId];
  if (!profileSchemaObj) {
    throw new Error(`Profile schema object not found: ${profileSchemaId}`);
  }

  const profileSchema = profileSchemaObj.schema || profileSchemaObj;
  const filteredAllOf: any[] = [];

  const addEntry = (entry: any): void => {
    if (!entry || typeof entry !== "object") return;
    if (hasLegacyDefinitionsRef(entry) || hasLegacyProfileOrModuleRef(entry)) {
      return;
    }

    let candidate = entry;
    if (
      options.removeIngredientInstructionOverrides &&
      entry.properties &&
      (entry.properties.ingredients || entry.properties.instructions)
    ) {
      candidate = { ...entry };
      if (candidate.properties) {
        const newProps: any = { ...candidate.properties };
        delete newProps.ingredients;
        delete newProps.instructions;
        if (Object.keys(newProps).length > 0) {
          candidate.properties = newProps;
        } else {
          delete candidate.properties;
        }
      }
    }

    if (Object.keys(candidate).length > 0) {
      filteredAllOf.push(candidate);
    }
  };

  if (Array.isArray(profileSchema.allOf)) {
    profileSchema.allOf.forEach(addEntry);
  }

  let wrapperAllOf = [...filteredAllOf];

  if (wrapperAllOf.length === 0 && Array.isArray(profileSchema.allOf) && profileSchema.allOf.length > 0) {
    const baseRef = profileSchema.allOf.find(
      (e: any) => e.$ref && !hasLegacyDefinitionsRef(e) && !hasLegacyProfileOrModuleRef(e),
    );
    if (baseRef) {
      wrapperAllOf = [baseRef];
    }
  }

  if (wrapperAllOf.length === 0) {
    wrapperAllOf = [{ $ref: BASE_SCHEMA_ID }];
  }

  const profileWrapper: any = {
    $id: profileWrapperId,
    allOf: wrapperAllOf,
  };

  context.ajv.addSchema(profileWrapper, profileWrapperId);
  return profileWrapperId;
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
  const profileWrapperId = getProfileWrapperSchemaId(context, profileSchemaId, cacheKey, {
    removeIngredientInstructionOverrides: hasStackSchemas,
  });
  allOf.push({ $ref: profileWrapperId });

  // Add stack schemas using registry
  const stackSchemaLoading = new Set<string>();
  for (const [name, version] of Object.entries(stacks)) {
    if (name.startsWith("x-")) {
      // Vendor stack - no schema enforcement
      continue;
    }

    const registryEntry = stackRegistryById.get(name);
    if (!registryEntry) {
      throw new Error(`Unknown stack: ${name}`);
    }
    if (!registryEntry.versions.includes(version)) {
      throw new Error(`Unsupported stack version for ${name}: ${version}`);
    }

    if (typeof version === "number" && version >= 1) {
      const schemaId = ensureStackSchemaLoaded(context.ajv, name, version, stackSchemaLoading);
      if (schemaId) {
        allOf.push({ $ref: schemaId });
      } else {
        throw new Error(`Stack schema for '${name}' version ${version} could not be loaded from registry.`);
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

  const schemaHint = typeof schemaOverride === "string" ? schemaOverride : typeof normalized.$schema === "string" ? normalized.$schema : undefined;
  const resolvedSchema = resolveSchemaHint(schemaHint);
  const schemaId = resolvedSchema.canonicalId; // Canonical for $schema field
  // For Ajv lookup, use vendored ID if canonical was requested (vendored is always registered)
  const rootSchemaId = (rootSchema as { $id?: string }).$id;
  const schemaIdForLookup = (schemaId === CANONICAL_SCHEMA_ID && rootSchemaId && rootSchemaId !== CANONICAL_SCHEMA_ID)
    ? rootSchemaId
    : schemaId;
  const hasSchemaOverride = typeof schemaOverride === "string";
  const isSoustackSchema = resolvedSchema.isSoustackSchema;
  if (isSoustackSchema && schemaId) {
    (normalized as any).$schema = schemaId;
    (normalizedInput as any).$schema = schemaId;
  }
  const isLegacySchemaHint = typeof schemaHint === "string" && schemaHint.startsWith(LEGACY_ROOT_SCHEMA_ID);
  
  // Check if recipe has stacks - if so, we need to use composed validation
  // even if $schema is set, because the root schema doesn't include stack properties
  const hasStacks = normalized.stacks && typeof normalized.stacks === "object" && !Array.isArray(normalized.stacks) && Object.keys(normalized.stacks).length > 0;
  
  // Only use direct schema validation if:
  // 1. Schema is specified AND
  // 2. It's a Soustack schema AND
  // 3. Recipe doesn't have stacks (stacks require composed validation)
  if (schemaId && isSoustackSchema && !hasStacks && hasSchemaOverride) {
    // Use schemaIdForLookup for Ajv (vendored ID), but schemaId for $schema field (canonical)
    const schemaValidator = context.ajv.getSchema(schemaIdForLookup ?? schemaId) ?? context.ajv.getSchema(DEFAULT_ROOT_SCHEMA_ID) ?? context.ajv.getSchema(rootSchemaId ?? '');
    if (schemaValidator) {

      const schemaInput = cloneRecipe(normalized);
      // Remove $schema from validation copy - it's a JSON Schema property, not part of the recipe schema
      if ("$schema" in schemaInput) {
        delete (schemaInput as any).$schema;
      }
      if (hasSchemaOverride && "$schema" in schemaInput && schemaInput.$schema !== schemaId) {
        delete (schemaInput as any).$schema;
      }
      const isLegacySchema = isLegacySchemaHint || (schemaId ? schemaId.startsWith(LEGACY_ROOT_SCHEMA_ID) : false);
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

export function __getComposedSchemaForTesting(profile: ProfileName, stacks: Record<string, number>): any {
  const context = getContext(false);
  const validator = getComposedValidator(profile, stacks, context);
  return validator.schema;
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
