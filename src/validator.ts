import Ajv2020, { ErrorObject, ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { Recipe } from "./types";
import { normalizeRecipe } from "./normalize";
import { validateConformance, ConformanceIssue } from "./conformance";
import rootSchema from "./soustack.schema.json";
import { SOUSTACK_SPEC_VERSION } from "./specVersion";
import baseSchema from "./schemas/recipe/base.schema.json";
import minimalProfileSchema from "./schemas/recipe/profiles/minimal.schema.json";
import coreProfileSchema from "./schemas/recipe/profiles/core.schema.json";
import baseProfileSchema from "./profiles/base.schema.json";
import cookableProfileSchema from "./profiles/cookable.schema.json";
import illustratedProfileSchema from "./profiles/illustrated.schema.json";
import quantifiedProfileSchema from "./profiles/quantified.schema.json";
import scalableProfileSchema from "./profiles/scalable.schema.json";
import schedulableProfileSchema from "./profiles/schedulable.schema.json";
import attributionStackSchema from "./schemas/recipe/stacks/attribution/1.schema.json";
import mediaStackSchema from "./schemas/recipe/stacks/media/1.schema.json";
import nutritionStackSchema from "./schemas/recipe/stacks/nutrition/1.schema.json";
import scheduleStackSchema from "./schemas/recipe/stacks/schedule/1.schema.json";
import taxonomyStackSchema from "./schemas/recipe/stacks/taxonomy/1.schema.json";
import timesStackSchema from "./schemas/recipe/stacks/times/1.schema.json";
import stacksRegistry from "./schemas/registry/stacks.json";
import profilesRegistry from "./schemas/registry/profiles.json";

type ProfileName =
  | "base"
  | "equipped"
  | "illustrated"
  | "lite"
  | "prepped"
  | "scalable"
  | "timed"
  | "minimal"
  | "core";

// Schema IDs from the vendored spec
const LEGACY_ROOT_SCHEMA_ID = `http://soustack.org/schema/v${SOUSTACK_SPEC_VERSION}`;
const DEFAULT_ROOT_SCHEMA_ID = "https://soustack.spec/soustack.schema.json";
const BASE_SCHEMA_ID = "http://soustack.org/schema/recipe/base.schema.json";
const PROFILE_SCHEMA_PREFIX = "http://soustack.org/schema/recipe/profiles/";

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
const profileRegistryOrder = (profilesRegistry.profiles || [])
  .map((entry) => (entry && typeof (entry as any).id === "string" ? (entry as any).id : undefined))
  .filter((entry): entry is string => typeof entry === "string");
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
  const schemas = [
    rootSchema,
    baseSchema,
    minimalProfileSchema,
    coreProfileSchema,
    baseProfileSchema,
    cookableProfileSchema,
    illustratedProfileSchema,
    quantifiedProfileSchema,
    scalableProfileSchema,
    schedulableProfileSchema,
    attributionStackSchema,
    mediaStackSchema,
    nutritionStackSchema,
    scheduleStackSchema,
    taxonomyStackSchema,
    timesStackSchema,
  ];

  for (const schema of schemas) {
    if (schema && typeof schema === "object" && "$id" in schema) {
      const schemaWithId = schema as { $id?: string };
      if (schemaWithId.$id) {
        ajv.addSchema(schemaWithId, schemaWithId.$id);
      }
    }
  }

  ajv.addSchema(
    {
      $id: DEFAULT_ROOT_SCHEMA_ID,
      allOf: [
        { $ref: LEGACY_ROOT_SCHEMA_ID },
        {
          type: "object",
          properties: {
            $schema: { const: DEFAULT_ROOT_SCHEMA_ID },
          },
        },
      ],
    },
    DEFAULT_ROOT_SCHEMA_ID,
  );
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
  const registry = new Map<string, StackRegistryInfo>();
  for (const entry of stacksRegistry.stacks || []) {
    if (!entry || typeof entry.id !== "string") continue;
    const versions = Array.isArray(entry.versions)
      ? entry.versions.filter((version) => Number.isInteger(version) && version >= 1)
      : [];
    const latestMajor =
      typeof (entry as any).latestMajor === "number"
        ? (entry as any).latestMajor
        : typeof entry.latest === "number"
          ? entry.latest
          : versions.length > 0
            ? Math.max(...versions)
            : 1;
    const requires = Array.isArray((entry as any).requires)
      ? (entry as any).requires.filter((requirement: unknown): requirement is string => typeof requirement === "string")
      : [];

    registry.set(entry.id, {
      latestMajor,
      versions: versions.length > 0 ? versions : [latestMajor],
      requires,
      minProfile: typeof (entry as any).minProfile === "string" ? (entry as any).minProfile : undefined,
    });
  }
  return registry;
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
  const registry = new Map<string, ProfileRegistryInfo>();
  for (const entry of profilesRegistry.profiles || []) {
    if (!entry || typeof (entry as any).id !== "string") continue;
    const requiresProfiles = Array.isArray((entry as any).requiresProfiles)
      ? (entry as any).requiresProfiles.filter((value: unknown): value is string => typeof value === "string")
      : [];
    const requiresStacksRaw: unknown[] = Array.isArray((entry as any).requiresStacks)
      ? (entry as any).requiresStacks
      : [];
    const requiresStacks = requiresStacksRaw
      .map(parseStackRequirement)
      .filter((value: StackRequirement | null): value is StackRequirement => value !== null);
    registry.set((entry as any).id, { requiresProfiles, requiresStacks });
  }
  return registry;
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
    const requiredSchemaId = `${PROFILE_SCHEMA_PREFIX}${requirement}.schema.json`;
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
      for (const error of validationErrors) {
        const formatted = formatAjvError(error);
        errors.push({
          path: formatted.path,
          keyword: formatted.keyword,
          message: `Profile '${profile}' requires profile '${requirement}' to be satisfied: ${formatted.message}`,
        });
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
 * Returns a stacks map (e.g., { times: 1, nutrition: 1 }).
 * Uses registry-provided latest major versions when available.
 */
function inferStacksFromPayload(recipe: any): Record<string, number> {
  const inferred: Record<string, number> = {};

  if (!recipe || typeof recipe !== "object") {
    return inferred;
  }

  for (const stackId of stackRegistryIds) {
    if (stackId in recipe && (recipe as any)[stackId] !== undefined) {
      const entry = stackRegistryById.get(stackId);
      inferred[stackId] = entry?.latestMajor ?? 1;
    }
  }

  return inferred;
}

function inferProfileFromRegistry(
  recipe: Recipe,
  declaredStacks: Record<string, number>,
  context: ValidationContext,
): ProfileName {
  let inferred: string | undefined;
  for (const profileId of profileRegistryOrder) {
    const requirementErrors = getProfileRequirementErrors(profileId, recipe, declaredStacks, context);
    if (requirementErrors.length > 0) {
      continue;
    }
    inferred = profileId;
  }

  if (inferred && typeof inferred === "string") {
    return inferred as ProfileName;
  }

  return "core";
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
  const allOf: any[] = [{ $ref: BASE_SCHEMA_ID }];

  // Verify base schema is loaded
  if (!context.ajv.getSchema(BASE_SCHEMA_ID)) {
    throw new Error(`Base schema not loaded: ${BASE_SCHEMA_ID}. Ensure schemas are loaded before creating validators.`);
  }

  // Add profile schema
  const profileSchemaId = `${PROFILE_SCHEMA_PREFIX}${profile}.schema.json`;
  if (!context.ajv.getSchema(profileSchemaId)) {
    throw new Error(`Profile schema not loaded: ${profileSchemaId}`);
  }
  allOf.push({ $ref: profileSchemaId });

  // Add stack schemas
  for (const [name, version] of Object.entries(stacks)) {
    if (typeof version === "number" && version >= 1) {
      // Stack schemas use https:// prefix
      const stackSchemaId = `https://soustack.org/schemas/recipe/stacks/${name}/${version}.schema.json`;
      if (!context.ajv.getSchema(stackSchemaId)) {
        throw new Error(`Stack schema not loaded: ${stackSchemaId}`);
      }
      allOf.push({ $ref: stackSchemaId });
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
): { ok: boolean; errors: NormalizedError[] } {
  const normalized = cloneRecipe(normalizedInput);

  // Get validation context
  const context = getContext(collectAllErrors);

  const schemaId = typeof schemaOverride === "string" ? schemaOverride : typeof normalized.$schema === "string" ? normalized.$schema : undefined;
  const hasSchemaOverride = typeof schemaOverride === "string";
  const isSoustackSchema = schemaId ? isSoustackSchemaId(schemaId) : false;
  if (schemaId && isSoustackSchema) {
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
    return {
      ok: !!schemaValid,
      errors: schemaErrors.map(formatAjvError),
    };
  }

  // Determine if we should use composed validation or root schema
  const hasProfile = normalized.profile && typeof normalized.profile === "string";
  
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
  // We include inferred stacks in the validation schema to enforce that stacks must be declared
  const inferredStacks = inferStacksFromPayload(normalized);
  
  // Merge declared and inferred stacks, using max(version) per stack name
  const allStacks: Record<string, number> = { ...inferredStacks, ...declaredStacks };

  let isValid: boolean;
  let errors: ErrorObject[] = [];

  // Infer profile if none specified, using declared stacks only
  // Always use composed validation (base + profile + stacks) instead of root schema
  const profile: ProfileName = hasProfile
    ? ((normalized.profile as string).toLowerCase() as ProfileName)
    : inferProfileFromRegistry(normalized, declaredStacks, context);

  const requirementErrors = getProfileRequirementErrors(profile, normalized, declaredStacks, context);
  if (requirementErrors.length > 0) {
    return {
      ok: false,
      errors: requirementErrors,
    };
  }

  // Always use composed validation for recipes (base + profile + stacks)
  // Root schema validation is only for standalone validation without profiles
  const profileSchemaId = `${PROFILE_SCHEMA_PREFIX}${profile}.schema.json`;
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
  {
    // Use composed validation (base + profile + stacks)
    // Include both declared and inferred stacks in schema to enforce contract
    // The schema will enforce that stacks must be declared if payload exists

    // Ensure stacks map exists for validation
    const validationCopy = cloneRecipe(normalized);
    if (!validationCopy.stacks || typeof validationCopy.stacks !== "object" || Array.isArray(validationCopy.stacks)) {
      (validationCopy as any).stacks = declaredStacks;
    }
    // Ensure profile exists
    if (!validationCopy.profile) {
      (validationCopy as any).profile = profile;
    }

    // Use allStacks (declared + inferred) in the validator to enforce contract
    const validator = getComposedValidator(profile, allStacks, context);
    isValid = validator(validationCopy);
    errors = validator.errors || [];

    // Check for unknown top-level keys using root schema (which has additionalProperties: false)
    // The composed validation uses base schema with additionalProperties: true, so we need this check
    if (isValid && context.rootValidator) {
      const rootCheckCopy = cloneRecipe(normalized);
      // Remove fields that root schema doesn't have but are valid in composed validation
      // Root schema doesn't include: @type, profile, stacks, or stack payloads
      if ("@type" in rootCheckCopy) {
        delete (rootCheckCopy as any)["@type"];
      }
      if ("stacks" in rootCheckCopy) {
        delete (rootCheckCopy as any).stacks;
      }
      if ("profile" in rootCheckCopy) {
        delete (rootCheckCopy as any).profile;
      }
      // Also remove stack payload fields that root schema doesn't have
      for (const field of stackRegistryIds) {
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
        const schemaConstErrors = context.rootValidator.errors.filter(
          (e) => e.keyword === "const" && e.instancePath === "/$schema"
        );
        const relevantErrors = [...unknownKeyErrors, ...schemaConstErrors];
        if (relevantErrors.length > 0) {
          errors.push(...relevantErrors);
          isValid = false;
        }
      }
    }
  }

  return {
    ok: isValid,
    errors: errors.map(formatAjvError),
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
  const result = validateRecipe(recipe, { collectAllErrors: false });
  if (!result.ok) return [];

  // For now, return core as default since we're using root schema validation
  // This can be enhanced later to check against specific profile schemas
  return ["core"];
}
