# Soustack Core

> **The Logic Engine for Computational Recipes.**

[![npm version](https://img.shields.io/npm/v/soustack.svg)](https://www.npmjs.com/package/soustack)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)

**Soustack Core** is the reference implementation for the [Soustack Standard](https://github.com/soustack/spec). It provides the validation, parsing, and scaling logic required to turn static recipe data into dynamic, computable objects.

---

## 💡 The Value Proposition

Most recipe formats (like Schema.org) are **descriptive**—they tell you _what_ a recipe is.
Soustack is **computational**—it understands _how_ a recipe behaves.

### The Problems We Solve:

1.  **The "Salty Soup" Problem (Intelligent Scaling):**
    - _Old Way:_ Doubling a recipe doubles every ingredient blindly.
    - _Soustack:_ Understands that salt scales differently than flour, and frying oil shouldn't scale at all. It supports **Linear**, **Fixed**, **Discrete**, and **Baker's Percentage** scaling modes.
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

## What’s Included

- **Validation**: `validateRecipe()` validates Soustack JSON against the bundled schema.
- **Scaling & Computation**: `scaleRecipe()` produces a flat, UI-ready “computed recipe” (scaled ingredients + aggregated timing).
- **Parsers**:
  - Ingredient parsing (`parseIngredient`, `parseIngredientLine`)
  - Duration parsing (`smartParseDuration`)
  - Yield parsing (`parseYield`)
- **Schema.org Conversion**:
  - `fromSchemaOrg()` (Schema.org JSON-LD → Soustack)
  - `toSchemaOrg()` (Soustack → Schema.org JSON-LD)
- **Web Scraping**:
  - `scrapeRecipe()` fetches a recipe page and extracts Schema.org recipe data (Node.js only)
  - `extractRecipeFromHTML()` extracts recipe data from HTML string (browser & Node.js compatible)
  - Supports JSON-LD (`<script type="application/ld+json">`) and Microdata (`itemscope/itemtype`)

## Programmatic Usage

```ts
import {
  scrapeRecipe,
  extractRecipeFromHTML,
  fromSchemaOrg,
  toSchemaOrg,
  validateRecipe,
  scaleRecipe,
} from 'soustack';

// Validate a Soustack recipe JSON object
validateRecipe(recipe);

// Scale a recipe to a target yield amount (returns a "computed recipe")
const computed = scaleRecipe(recipe, 2);

// Scrape a URL into a Soustack recipe (Node.js only, throws if no recipe is found)
const scraped = await scrapeRecipe('https://example.com/recipe');

// Extract recipe from HTML string (browser & Node.js compatible)
const html = await fetch('https://example.com/recipe').then((r) => r.text());
const recipe = extractRecipeFromHTML(html);

// Convert Schema.org → Soustack
const soustack = fromSchemaOrg(schemaOrgJsonLd);

// Convert Soustack → Schema.org
const jsonLd = toSchemaOrg(recipe);
```

## 🔁 Schema.org Conversion

Use the new helpers to move between Schema.org JSON-LD and Soustack's structured recipe format.

```ts
import { fromSchemaOrg, toSchemaOrg } from 'soustack';

const soustackRecipe = fromSchemaOrg(schemaOrgJsonLd);
const schemaOrgRecipe = toSchemaOrg(soustackRecipe);
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

### Browser: `extractRecipeFromHTML()`

`extractRecipeFromHTML(html)` extracts recipe data from an HTML string. **Works in both browser and Node.js**. Perfect for browser usage where you fetch HTML yourself (with cookies/session for authenticated content).

```ts
import { extractRecipeFromHTML } from 'soustack';

// In browser: fetch HTML yourself (bypasses CORS, uses your cookies/session)
const response = await fetch('https://example.com/recipe');
const html = await response.text();
const recipe = extractRecipeFromHTML(html);
```

**Why use `extractRecipeFromHTML()` in browsers?**

- ✅ No CORS issues — you fetch HTML yourself
- ✅ Works with authenticated/paywalled content — uses browser cookies
- ✅ Smaller bundle — no Node.js dependencies
- ✅ Universal — works in both browser and Node.js environments

### CLI

```bash
# Validate & Scale (existing commands)
npx soustack validate recipe.soustack.json
npx soustack scale recipe.soustack.json 2

# Schema.org ↔ Soustack
npx soustack import recipe.jsonld -o recipe.soustack.json
npx soustack export recipe.soustack.json -o recipe.jsonld
npx soustack scrape "https://example.com/recipe" -o recipe.soustack.json
```

## 🔄 Keeping the Schema in Sync

The `src/schema.json` file in this repository is a **copy** of the official standard.
The source of truth lives in [RichardHerold/soustack-spec](https://github.com/RichardHerold/soustack-spec).

**Do not edit `src/schema.json` manually.**

To update to the latest version of the standard, run:

```bash
npm run sync:spec
```

## Development

```bash
npm test
```
