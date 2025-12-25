import { SOUSTACK_SPEC_VERSION } from "./specVersion";

export const CANONICAL_SCHEMA_ID = "https://soustack.spec/soustack.schema.json";
export const LEGACY_SCHEMA_ID = `http://soustack.org/schema/v${SOUSTACK_SPEC_VERSION}`;

const RAW_SPEC_BASE = "https://raw.githubusercontent.com/soustack/soustack-spec";
const RAW_SPEC_FORK_BASE = "https://raw.githubusercontent.com/RichardHerold/soustack-spec";

export const SCHEMA_ALIAS_MAP = new Map<string, string>([
  [CANONICAL_SCHEMA_ID, CANONICAL_SCHEMA_ID],
  [LEGACY_SCHEMA_ID, CANONICAL_SCHEMA_ID],
  [`${LEGACY_SCHEMA_ID}/`, CANONICAL_SCHEMA_ID],
  ["https://soustack.org/schema/v0.0.2", CANONICAL_SCHEMA_ID],
  ["https://soustack.org/schema/v0.0.2/", CANONICAL_SCHEMA_ID],
  [`${RAW_SPEC_BASE}/main/soustack.schema.json`, CANONICAL_SCHEMA_ID],
  [`${RAW_SPEC_BASE}/v${SOUSTACK_SPEC_VERSION}/soustack.schema.json`, CANONICAL_SCHEMA_ID],
  [`${RAW_SPEC_FORK_BASE}/main/soustack.schema.json`, CANONICAL_SCHEMA_ID],
  [`${RAW_SPEC_FORK_BASE}/v${SOUSTACK_SPEC_VERSION}/soustack.schema.json`, CANONICAL_SCHEMA_ID],
]);

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
    mapped.startsWith("https://soustack.org/schemas/");

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
  const resolved = resolveSchemaHint(existing);
  const schemaId = resolved.isSoustackSchema ? resolved.canonicalId : CANONICAL_SCHEMA_ID;

  return {
    ...(value as any),
    $schema: schemaId ?? CANONICAL_SCHEMA_ID,
  } as T;
}
