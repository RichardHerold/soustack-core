import Ajv, { ErrorObject, ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import baseSchema from "./schema.json";
import coreProfileSchema from "./profiles/core.schema.json";
import baseProfileSchema from "./profiles/base.schema.json";
import cookableProfileSchema from "./profiles/cookable.schema.json";
import quantifiedProfileSchema from "./profiles/quantified.schema.json";
import illustratedProfileSchema from "./profiles/illustrated.schema.json";
import schedulableProfileSchema from "./profiles/schedulable.schema.json";
import minimalProfileSchema from "./profiles/minimal.schema.json";
import scheduleModuleV1 from "./modules/schedule/1.schema.json";
import nutritionModuleV1 from "./modules/nutrition/1.schema.json";
import attributionModuleV1 from "./modules/attribution/1.schema.json";
import taxonomyModuleV1 from "./modules/taxonomy/1.schema.json";
import mediaModuleV1 from "./modules/media/1.schema.json";
import timesModuleV1 from "./modules/times/1.schema.json";
import { Recipe } from "./types";
import { parseDuration } from "./parsers/duration";

type ProfileName =
  | "minimal"
  | "core"
  | "base"
  | "cookable"
  | "scalable"
  | "quantified"
  | "illustrated"
  | "schedulable";

const CANONICAL_BASE_SCHEMA_ID =
  "https://soustack.org/schemas/recipe/base.schema.json";
const canonicalProfileId = (profile: string) =>
  `https://soustack.org/schemas/recipe/profiles/${profile}.schema.json`;
const moduleIdToSchemaRef = (moduleId: string): string => {
  const match = moduleId.match(/^([a-z0-9_-]+)@(\d+(?:\.\d+)*)$/i);
  if (!match) {
    throw new Error(`Invalid module identifier '${moduleId}'. Expected <name>@<version>.`);
  }

  const [, name, version] = match;
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
  base: baseProfileSchema,
  cookable: cookableProfileSchema,
  scalable: baseProfileSchema,
  quantified: quantifiedProfileSchema,
  illustrated: illustratedProfileSchema,
  schedulable: schedulableProfileSchema,
};

const moduleSchemas: Record<string, any> = {
  "schedule@1": scheduleModuleV1,
  "nutrition@1": nutritionModuleV1,
  "attribution@1": attributionModuleV1,
  "taxonomy@1": taxonomyModuleV1,
  "media@1": mediaModuleV1,
  "times@1": timesModuleV1,
};

function createBaseSchemaWithModules(): any {
  const cloned = deepClone(baseSchema as any);
  cloned.properties = {
    ...(cloned.properties ?? {}),
    profile: { type: "string" },
    modules: {
      type: "array",
      items: { type: "string" },
      uniqueItems: true,
      default: [],
    },
    attribution: { type: "object", additionalProperties: true },
    taxonomy: { type: "object", additionalProperties: true },
    media: { type: "object", additionalProperties: true },
    times: { type: "object", additionalProperties: true },
    nutrition: {
      type: "object",
      additionalProperties: true,
    },
  };

  const moduleGuards = [
    { field: "nutrition", module: "nutrition@1" },
    { field: "attribution", module: "attribution@1" },
    { field: "taxonomy", module: "taxonomy@1" },
    { field: "media", module: "media@1" },
    { field: "times", module: "times@1" },
  ].map(({ field, module }) => ({
    if: { required: [field] },
    then: {
      required: ["modules"],
      properties: {
        modules: {
          type: "array",
          contains: { const: module },
        },
      },
    },
  }));

  cloned.allOf = [...(cloned.allOf ?? []), ...moduleGuards];
  return cloned;
}

const baseSchemaWithModules = createBaseSchemaWithModules();

const validationContexts: Map<boolean, ValidationContext> = new Map();

function createContext(collectAllErrors: boolean): ValidationContext {
  const ajv = new Ajv({ strict: false, allErrors: collectAllErrors });
  addFormats(ajv);

  const addSchemaWithAlias = (schema: any, alias?: string) => {
    if (!schema) return;
    if (alias) {
      ajv.addSchema(schema, alias);
    } else {
      ajv.addSchema(schema);
    }
  };

  addSchemaWithAlias(baseSchemaWithModules, CANONICAL_BASE_SCHEMA_ID);

  Object.entries(profileSchemas).forEach(([name, schema]) => {
    addSchemaWithAlias(schema, canonicalProfileId(name));
  });

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

function getCombinedValidator(
  profile: ProfileName,
  modules: string[],
  context: ValidationContext,
): ValidateFunction {
  const cacheKey = `${profile}::${modules.join(",")}`;
  const cached = context.validators.get(cacheKey);
  if (cached) return cached;

  if (!profileSchemas[profile]) {
    throw new Error(`Unknown Soustack profile: ${profile}`);
  }

  const schema = {
    $id: `urn:soustack:recipe:${cacheKey || "base"}`,
    allOf: [
      { $ref: CANONICAL_BASE_SCHEMA_ID },
      { $ref: canonicalProfileId(profile) },
      ...modules.map((moduleId) => ({ $ref: moduleIdToSchemaRef(moduleId) })),
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

const allowedTopLevelProps = new Set<string>([
  ...Object.keys((baseSchemaWithModules as any)?.properties ?? {}),
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
  modules: string[],
  context: ValidationContext,
): NormalizedError[] {
  try {
    const validateFn = getCombinedValidator(profile, modules, context);
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
  const schemaRef = options.schema ?? (typeof input?.$schema === "string" ? input.$schema : undefined);
  const profileFromDocument = typeof input?.profile === "string" ? (input.profile as ProfileName) : undefined;
  const profile: ProfileName =
    options.profile ?? profileFromDocument ?? detectProfileFromSchema(schemaRef) ?? "core";
  const modulesFromDocument = Array.isArray(input?.modules)
    ? (input.modules as string[]).filter((value) => typeof value === "string")
    : [];
  const modules = [...modulesFromDocument].sort();

  const { normalized, warnings } = normalizeRecipe(input as Recipe);

  if (modulesFromDocument.length > 0) {
    (normalized as any).modules = modules;
  }
  if (profileFromDocument) {
    (normalized as any).profile = profileFromDocument;
  }

  const unknownKeyErrors = detectUnknownTopLevelKeys(normalized);
  const validationErrors = runAjvValidation(normalized, profile, modules, context);
  const graphErrors =
    (profile === "schedulable" || modules.includes("schedule@1")) && validationErrors.length === 0
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
  const profiles: ProfileName[] = ["core"];
  const context = getContext(false);

  (Object.keys(profileSchemas) as ProfileName[]).forEach((profile) => {
    if (profile === "core") return;
    if (!profileSchemas[profile]) return;
    const errors = runAjvValidation(normalizedRecipe, profile, [], context);
    if (errors.length === 0) {
      profiles.push(profile);
    }
  });

  return profiles;
}
