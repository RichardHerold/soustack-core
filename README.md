# Soustack Core

> **The Logic Engine for Computational Recipes.**

[![npm version](https://img.shields.io/npm/v/soustack.svg)](https://www.npmjs.com/package/soustack)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)

**Soustack Core** is the reference implementation for the [Soustack Standard](https://github.com/RichardHerold/soustack-spec). It provides the validation, parsing, and scaling logic required to turn static recipe data into dynamic, computable objects.

> **Schema URLs**: The canonical schema host is `https://spec.soustack.org`. Core accepts legacy schema URLs (e.g., `https://soustack.spec/`, `https://soustack.ai/schemas/`) for backward compatibility but always emits canonical URLs in generated output (convert/import/scrape output, normalization output, etc.).

---

## 💡 The Value Proposition

Most recipe formats (like Schema.org) are **descriptive**—they tell you _what_ a recipe is.
Soustack is **computational**—it understands _how_ a recipe behaves.

### The Problems We Solve:

1.  **The "Salty Soup" Problem (Intelligent Scaling):**
    - _Old Way:_ Doubling a recipe doubles every ingredient blindly.
    - _Soustack:_ Understands that salt scales differently than flour, and frying oil shouldn't scale at all. It supports **Linear**, **Fixed**, **Discrete**, **Proportional**, and **Baker's Percentage** scaling modes.
2.  **The "Lying Prep Time" Problem:**
    - _Old Way:_ Authors guess "Prep: 15 mins."
    - _Soustack:_ Calculates total time dynamically based on the active/passive duration of every step.
3.  **The "Timing Clash" Problem:**
    - _Old Way:_ A flat list of instructions.
    - _Soustack:_ A **Dependency Graph** that knows you can chop vegetables while the water boils.

---

## 📦 Installation

```bash
npm install soustack
```

## What's Included

- **Validation**: `validateRecipe()` validates Soustack JSON against the bundled schema and optional conformance checks.
- **Scaling & Computation**: `scaleRecipe()` scales a recipe while honoring per-ingredient scaling rules and instruction timing.
- **Schema.org Conversion**:
  - `fromSchemaOrg()` (Schema.org JSON-LD → Soustack)
  - `toSchemaOrg()` (Soustack → Schema.org JSON-LD)
- **Web Extraction**:
  - Browser-safe HTML parsing: `extractSchemaOrgRecipeFromHTML()` (convert to Soustack with `fromSchemaOrg()`)
  - Node-only scraping entrypoint: `scrapeRecipe()` and helpers via `import { ... } from 'soustack/scrape'`
- **Unit Conversion**: `convertLineItemToMetric()` converts ingredient line items from imperial volumes/masses into metric with deterministic rounding and ingredient-aware equivalencies.

## 🚀 Quickstart

Validate and scale a recipe in just a few lines:

```ts
import { validateRecipe, scaleRecipe } from 'soustack';

// Validate against the bundled Soustack schema + conformance rules
const { ok, schemaErrors, conformanceIssues, warnings } = validateRecipe(recipe);
if (!ok) {
  throw new Error(JSON.stringify({ schemaErrors, conformanceIssues }, null, 2));
}
if (warnings?.length) {
  console.warn('Non-blocking warnings', warnings);
}

// Schema-only validation (skip conformance checks)
const schemaOnly = validateRecipe(recipe, { mode: 'schema' });
if (!schemaOnly.ok) {
  console.error(schemaOnly.schemaErrors);
}

// Scale to a new yield (multiplier, target yield, or servings)
const scaled = scaleRecipe(recipe, { multiplier: 2 });
```

### Profile-aware validation

Use profiles to enforce integration contracts. Available profiles:
- **base**
- **equipped**
- **illustrated**
- **lite**
- **prepped**
- **scalable**
- **timed**

```ts
import { detectProfiles, validateRecipe } from 'soustack';

// Discover which profiles a recipe already satisfies
const profiles = detectProfiles(recipe);

// Validate with a specific profile
const result = validateRecipe(recipe, { profile: 'base' });
if (!result.ok) {
  console.error('Profile validation failed', result.schemaErrors);
}

// Validate with stacks
const recipeWithStacks = {
  profile: 'base',
  stacks: { scaling: 1, storage: 1 },
  name: 'Test Recipe',
  ingredients: [{ ingredient: 'flour', quantity: 1, unit: 'cup' }],
  instructions: ['Mix'],
  // Stack payloads are validated when stacks are declared
};
const result2 = validateRecipe(recipeWithStacks);
// Validates using: base profile + scaling@1 stack + storage@1 stack
// Stack contract: if stack is declared, corresponding payload must exist (and vice versa)
```

### Imperial → metric ingredient conversion

```ts
import { convertLineItemToMetric } from 'soustack';

const flour = convertLineItemToMetric(
  { ingredient: 'flour', quantity: 2, unit: 'cup' },
  'mass'
);
// -> { ingredient: 'flour', quantity: 240, unit: 'g', notes: 'Converted using 120g per cup...' }

const liquid = convertLineItemToMetric(
  { ingredient: 'milk', quantity: 2, unit: 'cup' },
  'volume'
);
// -> { ingredient: 'milk', quantity: 473, unit: 'ml' }
```

The converter rounds using “sane” defaults (1 g/ml under 1 kg/1 L, then 5 g/10 ml and 2 decimal places for kg/L) and surfaces typed errors:

- `UnknownUnitError` for unsupported unit tokens
- `UnsupportedConversionError` if you request a mismatched dimension
- `MissingEquivalencyError` when no volume→mass density is registered for the ingredient/unit combo

### Browser-safe vs. Node-only entrypoints

- **Browser-safe:** `import { extractSchemaOrgRecipeFromHTML, fromSchemaOrg, validateRecipe, scaleRecipe } from 'soustack';`
  - Ships without Node fetch/cheerio dependencies.
- **Node-only scraping:** `import { scrapeRecipe, extractRecipeFromHTML, extractSchemaOrgRecipeFromHTML } from 'soustack/scrape';`
  - Includes HTTP fetching, retries, and cheerio-based parsing for server environments.

## Spec compatibility & bundled schemas

- Targets Soustack spec **v0.0.2** (`spec/SOUSTACK_SPEC_VERSION`, exported as `SOUSTACK_SPEC_VERSION`).
- Ships the base schema, profile schemas, and stack schemas in `spec/stacks/` and mirrors them into `src/stacks/` for consumers.
- Vendored fixtures live in `spec/fixtures` so tests can run offline, and version drift can be checked via `npm run validate:version`.

### Composed Validation Model

Soustack v0.0.2 uses a **composed validation model** where recipes are validated using JSON Schema's `allOf` composition:

```json
{
  "allOf": [
    { "$ref": "base.schema.json" },
    { "$ref": "profiles/{profile}.schema.json" },
    { "$ref": "stacks/{stack1}.schema.json" },
    { "$ref": "stacks/{stack2}.schema.json" }
  ]
}
```

The validator:
- **Base schema**: Defines the core recipe structure (`@type`, `name`, `ingredients`, `instructions`, `profile`, `stacks`)
- **Profile overlay**: Adds profile-specific requirements (e.g., `base` or `lite`)
- **Stack overlays**: Each declared stack adds its own validation rules

**Defaults:**
- If `profile` is missing, it defaults to the schema bundle's configured default
- If `stacks` is missing, it defaults to `{}`

**Stack Contract:** Stacks enforce a symmetric contract:
- If a stack is declared in `stacks`, the corresponding payload must exist (for non-structural stacks)
- If a payload exists (e.g., `storage`, `equipment`), the stack must be declared
- The validator automatically infers stacks from payloads and enforces this contract

**Caching:** Validators are cached by `${profile}::${sortedStackNames.join(",")}` for performance.

### Stack Resolution

Stacks are resolved to schema references using the pattern:
- Stack declaration format: `{ "stackName": versionNumber }` (e.g., `{ "scaling": 1, "storage": 1 }`)
- Schema reference: `https://spec.soustack.org/stacks/{stackName}.schema.json`

The stack registry (`stacks/registry.json`) defines which stacks are available and their properties, including:
- Stack dependencies (e.g., `scaling` requires `quantified`)
- Profile requirements (some stacks require specific profiles)

**Available Stacks (v0.0.2):**
- `quantified`: Quantified ingredients with units
- `scaling`: Scaling rules and modes
- `structured`: Structured instructions with steps
- `timed`: Timing information for instructions
- `illustrated`: Images and videos
- `equipment`: Required tools and equipment
- `storage`: Storage instructions
- `prep`: Prep guidance and mise en place
- `dietary`: Dietary information
- `substitutions`: Ingredient substitutions
- `techniques`: Cooking techniques
- `compute`: Computational recipe features

## Programmatic Usage

```ts
import {
  extractSchemaOrgRecipeFromHTML,
  fromSchemaOrg,
  toSchemaOrg,
  validateRecipe,
  scaleRecipe,
} from 'soustack';
import {
  scrapeRecipe,
  extractRecipeFromHTML,
  extractSchemaOrgRecipeFromHTML as extractSchemaOrgRecipeFromHTMLNode,
} from 'soustack/scrape';

// Validate a Soustack recipe JSON object with profile enforcement
const validation = validateRecipe(recipe, { profile: 'base' });
if (!validation.ok) {
  console.error({ schemaErrors: validation.schemaErrors, conformanceIssues: validation.conformanceIssues });
}

// Scale a recipe to a target yield amount (returns a "computed recipe")
const scaled = scaleRecipe(recipe, { multiplier: 2 });

// Scrape a URL into a Soustack recipe (Node.js only, throws if no recipe is found)
const scraped = await scrapeRecipe('https://example.com/recipe');

// Browser: fetch your own HTML, then parse and convert
const html = await fetch('https://example.com/recipe').then((r) => r.text());
const schemaOrgRecipe = extractSchemaOrgRecipeFromHTML(html);
const recipe = schemaOrgRecipe ? fromSchemaOrg(schemaOrgRecipe) : null;

// Node: parse raw HTML with cheerio-powered extractor
const nodeSchemaOrg = extractSchemaOrgRecipeFromHTMLNode(html);
const nodeRecipe = extractRecipeFromHTML(html);

// Convert Schema.org → Soustack
const soustack = fromSchemaOrg(schemaOrgJsonLd);

// Convert Soustack → Schema.org
const jsonLd = toSchemaOrg(recipe);

```

## 🪶 Core-lite (browser) Schema.org conversion

Need to stay browser-only? Import the core bundle (no `fetch`, no cheerio) and perform Schema.org extraction and conversion entirely client-side:

```ts
import { extractSchemaOrgRecipeFromHTML, fromSchemaOrg, toSchemaOrg } from 'soustack';

async function convert(url: string) {
  const html = await fetch(url).then((r) => r.text());

  // Pure DOMParser-based extraction (works in modern browsers)
  const schemaOrg = extractSchemaOrgRecipeFromHTML(html);
  if (!schemaOrg) throw new Error('No Schema.org recipe found');

  // Convert to Soustack and back to Schema.org JSON-LD if needed
  const soustackRecipe = fromSchemaOrg(schemaOrg);
  const jsonLd = toSchemaOrg(soustackRecipe);

  return { soustackRecipe, jsonLd };
}
```

## 🔁 Schema.org Conversion

Use the helpers to move between Schema.org JSON-LD and Soustack's structured recipe format. The conversion automatically handles image normalization, supporting multiple image formats from Schema.org.

**BREAKING CHANGE in v0.0.2:** `toSchemaOrg()` now targets the **lite profile** and only includes stacks that can be mapped to Schema.org format. Non-mappable stacks are excluded from the conversion.

```ts
import { fromSchemaOrg, toSchemaOrg, normalizeImage } from 'soustack';

// Convert Schema.org → Soustack (automatically normalizes images)
const soustackRecipe = fromSchemaOrg(schemaOrgJsonLd);
// Recipe images: string | string[] | undefined
// Instruction images: optional image URL per step

// Convert Soustack → Schema.org (preserves images)
const schemaOrgRecipe = toSchemaOrg(soustackRecipe);

// Manual image normalization (if needed)
const normalized = normalizeImage(schemaOrgImage);
// Handles: strings, arrays, ImageObjects with url/contentUrl
```

### Image Format Support

Soustack supports flexible image formats:

- **Recipe-level images**: Single URL (`string`) or multiple URLs (`string[]`)
- **Instruction-level images**: Optional `image` property on instruction objects
- **Automatic normalization**: Schema.org ImageObjects are automatically converted to URLs during import

Example recipe with images:

```ts
const recipe = {
  name: "Chocolate Cake",
  image: ["https://example.com/hero.jpg", "https://example.com/gallery.jpg"],
  instructions: [
    "Mix dry ingredients",
    { text: "Decorate the cake", image: "https://example.com/decorate.jpg" },
    "Serve"
  ]
};
```

## 🧰 Web Scraping

### Node.js: `scrapeRecipe()`

`scrapeRecipe(url, options)` fetches a recipe page and extracts Schema.org data. **Node.js only** due to CORS restrictions.

Options:

- `timeout` (ms, default `10000`)
- `userAgent` (string, optional)
- `maxRetries` (default `2`, retries on non-4xx failures)

```ts
import { scrapeRecipe } from 'soustack';

const recipe = await scrapeRecipe('https://example.com/recipe', {
  timeout: 15000,
  maxRetries: 3,
});
```

### Browser: `extractSchemaOrgRecipeFromHTML()`

`extractSchemaOrgRecipeFromHTML(html)` extracts the raw Schema.org recipe data from HTML. Returns `null` if no recipe is found. Use this when you need to inspect, debug, or convert Schema.org data in browser builds without dragging in Node dependencies.

```ts
import { extractSchemaOrgRecipeFromHTML, fromSchemaOrg } from 'soustack';

// In browser: fetch HTML yourself
const response = await fetch('https://example.com/recipe');
const html = await response.text();

// Extract Schema.org format (for inspection/modification)
const schemaOrgRecipe = extractSchemaOrgRecipeFromHTML(html);

if (schemaOrgRecipe) {
  // Inspect or modify Schema.org data before converting
  console.log('Found recipe:', schemaOrgRecipe.name);

  // Convert to Soustack format when ready
  const soustackRecipe = fromSchemaOrg(schemaOrgRecipe);
}
```

### Node-only scraping: `soustack/scrape`

For server-side scraping with built-in fetching and cheerio-based parsing, use the dedicated entrypoint:

```ts
import { scrapeRecipe, extractRecipeFromHTML, fetchPage } from 'soustack/scrape';

// Fetch and parse a URL directly
const recipe = await scrapeRecipe('https://example.com/recipe');

// Or work with already-downloaded HTML
const html = await fetchPage('https://example.com/recipe');
const parsed = extractRecipeFromHTML(html);
```

### CLI

```bash
# Validate with profiles (JSON output for pipelines)
npx soustack validate recipe.soustack.json --profile base --strict --json

# Schema-only validation (skip semantic conformance checks)
npx soustack validate recipe.soustack.json --schema-only

# Stable JSON conformance report for CI
npx soustack check recipe.soustack.json --json

# Repo-wide test run (validates every *.soustack.json)
npx soustack test --profile base

# Convert Schema.org ↔ Soustack
npx soustack convert --from schemaorg --to soustack recipe.jsonld -o recipe.soustack.json
npx soustack convert --from soustack --to schemaorg recipe.soustack.json -o recipe.jsonld

# Scrape URLs (canonical workflow)
npx soustack scrape <url> -o recipe.soustack.json

# Import from URL (optional alias for scrape, for compatibility)
npx soustack import --url "https://example.com/recipe" -o recipe.soustack.json

# Bulk ingest pipeline (delegates to @soustack/ingest)
npx soustack ingest <input> --out <dir>  # requires @soustack/ingest

# Scale recipes
npx soustack scale recipe.soustack.json 2
```

## 🔄 Keeping the Schema in Sync

The schema files in this repository are **copies** of the official standard. The source of truth lives in [RichardHerold/soustack-spec](https://github.com/RichardHerold/soustack-spec) (published as `@soustack/spec` on npm).

**Do not edit any synced schema artifacts manually** (`src/schema.json`, `src/soustack.schema.json`, `src/profiles/*.schema.json`).

To update to the latest tagged version of the standard, run:

```bash
npm run sync:spec
```

## Development

```bash
npm test
```
