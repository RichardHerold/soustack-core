export type SoustackPackMeta = {
  packedAt: string;
  count: number;
  source?: string;
};

export type SoustackPack<TRecipe> = {
  recipes: TRecipe[];
  meta: SoustackPackMeta;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

// Keep this intentionally minimal and spec-agnostic:
// - no schema validation
// - preserves unknown x-* fields by returning objects as-is
// - deterministic filtering only
export function isSoustackRecipeLike(x: unknown): boolean {
  if (!isRecord(x)) return false;
  return (
    typeof x.name === 'string' &&
    typeof x.profile === 'string' &&
    isRecord(x.stacks) &&
    Array.isArray(x.ingredients) &&
    Array.isArray(x.instructions)
  );
}

export function packSoustackRecipes<TRecipe extends Record<string, unknown>>(args: {
  recipes: unknown[];
  packedAt: string;
  source?: string;
}): SoustackPack<TRecipe> {
  const out: TRecipe[] = [];
  for (const r of args.recipes) {
    if (isSoustackRecipeLike(r)) out.push(r as TRecipe);
  }
  return {
    recipes: out,
    meta: {
      packedAt: args.packedAt,
      count: out.length,
      source: args.source,
    },
  };
}
