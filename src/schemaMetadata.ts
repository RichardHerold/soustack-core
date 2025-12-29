import { SOUSTACK_SPEC_VERSION } from "./specVersion";

export const CANONICAL_ROOT_SCHEMA_URL = "https://spec.soustack.org/soustack.schema.json";
export const CANONICAL_SCHEMA_ID = CANONICAL_ROOT_SCHEMA_URL;
export const LEGACY_SCHEMA_ID = `http://soustack.org/schema/v${SOUSTACK_SPEC_VERSION}`;

const RAW_SPEC_BASE = "https://raw.githubusercontent.com/soustack/soustack-spec";
const RAW_SPEC_FORK_BASE = "https://raw.githubusercontent.com/RichardHerold/soustack-spec";

// Legacy schema URLs that should be normalized to canonical
const LEGACY_SCHEMA_URLS = [
  // Old canonical (soustack.spec)
  "https://soustack.spec/soustack.schema.json",
  // Legacy soustack.org URLs
  LEGACY_SCHEMA_ID,
  `${LEGACY_SCHEMA_ID}/`,
  "https://soustack.org/schema/v0.0.2",
  "https://soustack.org/schema/v0.0.2/",
  // soustack.ai URLs (used by ingest in other repo)
  "https://soustack.ai/schemas/recipe.schema.json",
  // GitHub raw URLs
  `${RAW_SPEC_BASE}/main/soustack.schema.json`,
  `${RAW_SPEC_BASE}/v${SOUSTACK_SPEC_VERSION}/soustack.schema.json`,
  `${RAW_SPEC_FORK_BASE}/main/soustack.schema.json`,
  `${RAW_SPEC_FORK_BASE}/v${SOUSTACK_SPEC_VERSION}/soustack.schema.json`,
];

export const SCHEMA_ALIAS_MAP = new Map<string, string>(
  LEGACY_SCHEMA_URLS.map((url) => [url, CANONICAL_SCHEMA_ID])
);
// Also map canonical to itself
SCHEMA_ALIAS_MAP.set(CANONICAL_SCHEMA_ID, CANONICAL_SCHEMA_ID);

/**
 * Checks if a URL is a known legacy schema URL.
 */
export function isLegacySchemaUrl(url: string): boolean {
  if (typeof url !== "string" || !url) {
    return false;
  }
  const trimmed = url.replace(/#$/, "");
  return SCHEMA_ALIAS_MAP.has(trimmed) && SCHEMA_ALIAS_MAP.get(trimmed) !== trimmed;
}

/**
 * Normalizes a schema URL to canonical if it's a known legacy URL.
 * - If url matches a known legacy schema URL, returns canonical.
 * - If url is already canonical, returns canonical.
 * - If url is unknown, returns it unchanged (does not break unknown custom schemas).
 */
export function normalizeSchemaUrl(url: string | undefined | null): string | undefined {
  if (typeof url !== "string" || !url) {
    return undefined;
  }
  const trimmed = url.replace(/#$/, "");
  const mapped = SCHEMA_ALIAS_MAP.get(trimmed);
  if (mapped) {
    return mapped;
  }
  // If it's already canonical, return it
  if (trimmed === CANONICAL_SCHEMA_ID) {
    return CANONICAL_SCHEMA_ID;
  }
  // Unknown URL - return unchanged
  return trimmed;
}

export function resolveSchemaHint(value?: string): {
  canonicalId?: string;
  isSoustackSchema: boolean;
  wasAlias: boolean;
} {
  if (typeof value !== "string" || !value) {
    return { canonicalId: undefined, isSoustackSchema: false, wasAlias: false };
  }

  const trimmed = value.replace(/#$/, "");
  const mapped = SCHEMA_ALIAS_MAP.get(trimmed) ?? trimmed;
  const isSoustackSchema =
    SCHEMA_ALIAS_MAP.has(trimmed) ||
    mapped.startsWith("http://soustack.org/schema") ||
    mapped.startsWith("https://soustack.org/schema") ||
    mapped.startsWith("https://soustack.spec/") ||
    mapped.startsWith("https://soustack.org/schemas/") ||
    mapped.startsWith("https://spec.soustack.org/") ||
    mapped.startsWith("https://soustack.ai/schemas/");

  return {
    canonicalId: mapped,
    isSoustackSchema,
    wasAlias: mapped !== trimmed || SCHEMA_ALIAS_MAP.has(trimmed),
  };
}

export function withCanonicalSchema<T extends object>(value: T): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const existing = typeof (value as any).$schema === "string" ? (value as any).$schema : undefined;
  const normalized = normalizeSchemaUrl(existing);
  // If it's a Soustack schema (legacy or canonical), use canonical. Otherwise, use existing or canonical.
  const resolved = resolveSchemaHint(existing);
  const schemaId = resolved.isSoustackSchema 
    ? (normalized ?? CANONICAL_SCHEMA_ID)
    : (normalized ?? existing ?? CANONICAL_SCHEMA_ID);

  return {
    ...(value as any),
    $schema: schemaId,
  } as T;
}
