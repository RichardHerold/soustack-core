# Phase: Put recipe folder packing in `soustack-cli` (primitive in `soustack-core`)

* [x] DONE Add a pure “bundle/pack” primitive to `soustack-core`

  * No filesystem, no ZIP, no auth
  * Input: array of unknown objects
  * Output: `{ recipes: SoustackRecipe[], meta: {...} }`
* [x] DONE Implement folder/ZIP/file traversal + output writing in `soustack-cli`

  * Command: `soustack pack <path> -o <file>`
  * Deterministic ordering + stable metadata
* [x] DONE Keep `soustack-ingest` focused on *content→recipe conversion* (HTML/Markdown/PDF/OCR → Soustack), not packaging

## Assumptions

* You want “pack a folder into one upload file” as a developer tool and CI-friendly workflow, not a library import API.
* `soustack-ingest` already owns parsing/extraction/conversion concerns and should not expand into filesystem packaging commands.

## Files to change

soustack-core/src/bundle/pack.ts
soustack-core/src/bundle/index.ts
soustack-core/src/index.ts
soustack-cli/src/commands/pack.ts
soustack-cli/src/index.ts
soustack-cli/package.json

## Unified diffs

```diff
--- /dev/null
+++ b/soustack-core/src/bundle/pack.ts
@@
+export type SoustackPackMeta = {
+  packedAt: string;
+  count: number;
+  source?: string;
+};
+
+export type SoustackPack<TRecipe> = {
+  recipes: TRecipe[];
+  meta: SoustackPackMeta;
+};
+
+function isRecord(x: unknown): x is Record<string, unknown> {
+  return typeof x === 'object' && x !== null;
+}
+
+// Keep this intentionally minimal and spec-agnostic:
+// - no schema validation
+// - preserves unknown x-* fields by returning objects as-is
+// - deterministic filtering only
+export function isSoustackRecipeLike(x: unknown): boolean {
+  if (!isRecord(x)) return false;
+  return (
+    typeof x.name === 'string' &&
+    typeof x.profile === 'string' &&
+    isRecord(x.stacks) &&
+    Array.isArray(x.ingredients) &&
+    Array.isArray(x.instructions)
+  );
+}
+
+export function packSoustackRecipes<TRecipe extends Record<string, unknown>>(args: {
+  recipes: unknown[];
+  packedAt: string;
+  source?: string;
+}): SoustackPack<TRecipe> {
+  const out: TRecipe[] = [];
+  for (const r of args.recipes) {
+    if (isSoustackRecipeLike(r)) out.push(r as TRecipe);
+  }
+  return {
+    recipes: out,
+    meta: {
+      packedAt: args.packedAt,
+      count: out.length,
+      source: args.source,
+    },
+  };
+}
```

```diff
--- /dev/null
+++ b/soustack-core/src/bundle/index.ts
@@
+export * from './pack';
```

```diff
--- a/soustack-core/src/index.ts
+++ b/soustack-core/src/index.ts
@@
+export * as bundle from './bundle';
```

```diff
--- /dev/null
+++ b/soustack-cli/src/commands/pack.ts
@@
+import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
+import path from 'node:path';
+import process from 'node:process';
+import { bundle } from 'soustack-core';
+
+function nowIso(): string {
+  return new Date().toISOString();
+}
+
+function walkFiles(rootDir: string): string[] {
+  const out: string[] = [];
+  const stack: string[] = [rootDir];
+  while (stack.length > 0) {
+    const dir = stack.pop();
+    if (!dir) continue;
+    const entries = readdirSync(dir).sort((a, b) => a.localeCompare(b));
+    for (const name of entries) {
+      const abs = path.join(dir, name);
+      const st = statSync(abs);
+      if (st.isDirectory()) stack.push(abs);
+      else if (st.isFile()) {
+        const lower = name.toLowerCase();
+        if (lower.endsWith('.soustack.json') || lower.endsWith('.json')) out.push(abs);
+      }
+    }
+  }
+  return out.sort((a, b) => a.localeCompare(b));
+}
+
+export function runPack(argv: string[]) {
+  const args = new Set(argv);
+  const inPath = argv.find((a) => !a.startsWith('-') && a !== 'pack') || '.';
+  const outIdx = argv.findIndex((a) => a === '-o' || a === '--out');
+  const outFile = outIdx >= 0 ? argv[outIdx + 1] : 'soustack-recipes.pack.json';
+
+  if (!outFile || outFile.startsWith('-')) {
+    console.error('Missing output file. Use: soustack pack <path> -o <file>');
+    process.exit(1);
+  }
+
+  const root = path.resolve(process.cwd(), inPath);
+  const files = walkFiles(root);
+  const raw: unknown[] = [];
+  for (const abs of files) {
+    try {
+      raw.push(JSON.parse(readFileSync(abs, 'utf8')) as unknown);
+    } catch {
+      // skip unreadable JSON
+    }
+  }
+
+  const packed = bundle.packSoustackRecipes({
+    recipes: raw,
+    packedAt: nowIso(),
+    source: root,
+  });
+
+  const outAbs = path.resolve(process.cwd(), outFile);
+  writeFileSync(outAbs, JSON.stringify(packed, null, 2) + '\n', 'utf8');
+  console.log(`Packed ${packed.meta.count} recipe(s) → ${outAbs}`);
+}
```

```diff
--- a/soustack-cli/src/index.ts
+++ b/soustack-cli/src/index.ts
@@
+import process from 'node:process';
+import { runPack } from './commands/pack';
+
+const argv = process.argv.slice(2);
+const cmd = argv[0];
+
+if (cmd === 'pack') {
+  runPack(argv);
+} else {
+  console.error('Usage: soustack pack <path> -o <file>');
+  process.exit(1);
+}
```

```diff
--- a/soustack-cli/package.json
+++ b/soustack-cli/package.json
@@
   "bin": {
     "soustack": "dist/index.js"
   }
```

## Commands

```bash
npm run lint:fix
npm run typecheck
npm test
```

## Acceptance checks

* `soustack pack ./recipes -o soustack-recipes.pack.json` produces a JSON file with `{ recipes: [...], meta: {...} }`
* Output recipe ordering is deterministic for the same input folder (stable traversal + sorting)
* `soustack-core` pack function has no filesystem usage and can run in non-Node runtimes
* `npm run lint:fix`, `npm run typecheck`, `npm test` exit 0
