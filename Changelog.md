# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### BREAKING CHANGES

- Removed legacy profile artifacts from the npm package; shipped schemas now reflect the current stack/profile vocabulary only.

### Added

- Added `ValidateMode` and `ValidateResult` with explicit validation modes (`schema` vs `full`).
- Added `--schema-only` flag to the CLI to run schema-only validation.
- Added `soustack check <file> --json` CLI command for stable JSON conformance reports.
- Added `--force-profile` to the CLI to override a mismatched recipe profile.
- Added a release checklist covering CI verification, tagging, and npm publish steps.

### Changed

- `validateRecipe()` now returns a stable `{ ok, schemaErrors, conformanceIssues, warnings, normalizedRecipe }` payload.
- Updated CLI profile vocabulary and help text to match the latest spec.
- `$schema` defaults to the canonical `https://soustack.spec/soustack.schema.json` URL and uses the current profile vocabulary across validation and conversion helpers.
- Recipe/types, converters, and scaling helpers align to the current stack map structure instead of legacy profiles.

## [0.3.0] - 2025-12-16

### BREAKING CHANGES

- **Validator now uses base+profile+modules composition**: The validator has been refactored to use a composed validation model where recipes are validated using `allOf: [base, profile overlay, ...module overlays]`. The base schema, profile schemas, and module schemas are now loaded from the new layout: `schemas/recipe/base.schema.json`, `schemas/recipe/profiles/*`, and `schemas/recipe/modules/*`.
- **Profile defaults to "core" if missing**: If a recipe doesn't specify a `profile`, it now defaults to `"core"` instead of requiring explicit specification.
- **Modules defaults to []**: If a recipe doesn't specify a `modules` array, it now defaults to an empty array.
- **Module contract enforcement**: The validator now enforces a symmetric contract between module declarations and payloads:
  - If a module is declared in `modules`, the corresponding payload must exist (e.g., `modules: ['nutrition@1']` requires `nutrition` payload)
  - If a payload exists (e.g., `nutrition`, `times`), the module must be declared in `modules`
  - The validator automatically infers modules from payloads and enforces this contract
- **TimesModule field names changed**: The `TimesModule` interface now uses `prepMinutes`, `cookMinutes`, and `totalMinutes` instead of `prep`, `cook`, and `total`. This matches the v0.3 schema specification.
- **NutritionFacts simplified**: The `NutritionFacts` interface has been simplified to only include `calories` and `protein_g` as numbers. All Schema.org-specific fields (`fatContent`, `carbohydrateContent`, `proteinContent`, `fiberContent`, `sugarContent`, `sodiumContent`, `servingSize`) have been removed.
- **fromSchemaOrg output changes**: 
  - `fromSchemaOrg()` now emits `times` module with `prepMinutes`/`cookMinutes`/`totalMinutes` fields
  - `fromSchemaOrg()` now parses nutrition values as numbers (e.g., `'200 cal'` → `200`)
  - Modules are only declared if the corresponding payload exists
- **Schema.org conversion targets profile minimal + allowed modules**: `toSchemaOrg()` now targets the minimal profile and only includes modules that are marked as `schemaOrgMappable` in the modules registry. Non-mappable modules (e.g., `nutrition@1`, `schedule@1`) are excluded from the conversion.
- **Removed legacy profiles**: The validator no longer supports the legacy profiles (`base`, `cookable`, `scalable`, `quantified`, `illustrated`, `schedulable`). Only `minimal` and `core` profiles are supported in v0.3.0.
- **Removed legacy module schemas**: The `src/modules/**` directory has been removed. All module schemas are now in `src/schemas/recipe/modules/**`.

### Added

- Support for Soustack spec v0.3.0 with new schema layout
- Module registry integration for resolving module schemas
- Composed validation with caching by `${profile}::${sortedModules.join(",")}`
- Module contract enforcement (automatic inference and validation)
- Comprehensive module contract unit tests
- Spec fixture contract tests that validate all example fixtures
- Legacy guardrail tests to prevent reintroduction of legacy artifacts
- Documentation for composed validation model and module resolution

### Changed

- Updated spec sync logic to pull schemas from the new layout structure
- Validator now uses schema IDs from actual schema files instead of hardcoded IDs
- Module resolution uses the module registry to determine schema references
- `fromSchemaOrg()` now properly converts Schema.org nutrition data to v0.3 format (numeric values only)
- `fromSchemaOrg()` now converts times to v0.3 format (`prepMinutes`/`cookMinutes`/`totalMinutes`)
- Defaults (profile and modules) are now applied to normalized recipe before validation
- Updated test suite to reflect v0.3 behavior (removed brittle legacy tests)

## [0.2.2] - 2025-12-16

### Added

- README quickstart and profile-aware validation examples for `validateRecipe`, `scaleRecipe`, and `detectProfiles`.
- "Core-lite" browser snippet for DOMParser-only Schema.org extraction and conversion.
- Expanded CLI documentation covering validation, conversion, import, scaling, and repo-wide testing.

### Changed

- Clarified browser-safe versus Node-only entrypoints and copy/pasteable onboarding paths for new adopters.

## [0.2.1] - 2025-12-15

### Added

- Synced Soustack spec **v0.2.1** artifacts (base schema plus profile schemas).

### Changed

- Implemented **proportional** scaling mode alongside existing scaling behaviors.
- Updated documentation to reflect the current spec repository link, scaling modes, and bundled schema outputs.

### Fixed

- Corrected Baker's Percentage scaling to scale relative to the `referenceId` ratio/factor.

## [0.2.0] - 2025-12-15

### Added

- **Image normalization utility** (`normalizeImage`) that converts Schema.org image formats (strings, arrays, ImageObjects) to Soustack format.
- **Recipe-level image support**: Recipes can now have single image URLs (`string`) or multiple images (`string[]`).
- **Instruction-level image support**: Individual instructions can include an optional `image` property with a URL.
- **Automatic image extraction**: `fromSchemaOrg` automatically extracts and normalizes images from Schema.org ImageObjects using `url` or `contentUrl` properties.
- **Image preservation in exports**: `toSchemaOrg` includes recipe and instruction images when converting to Schema.org JSON-LD format.
- Comprehensive tests covering image normalization, converters, and round-trip conversion guarantees.

### Changed

- `Recipe.image` type changed from `string | undefined` to `string | string[] | undefined` to support multiple recipe images.
- `Instruction` interface now includes optional `image?: string` property for step-level images.
- `fromSchemaOrg` now extracts recipe and step images using the `normalizeImage` utility.
- `toSchemaOrg` includes recipe/step images when exporting to Schema.org JSON-LD.

## [0.1.0] - 2025-12-14

### Added

- **Core Logic Engine:** Initial release of the `scaleRecipe` parser that handles Intelligent Scaling.
- **Scaling Modes:** Support for `linear`, `fixed`, `discrete`, and `bakers_percentage` scaling types.
- **Validation:** Integrated `ajv` and `ajv-formats` to strictly validate JSON against the Soustack Schema.
- **Type Definitions:** Full TypeScript interfaces (`types.ts`) generated from the v0.1 Schema.
- **CLI Tool:** Added `bin/cli.ts` for running validation and scaling from the command line (`validate` and `scale` commands).
- **Unit Tests:** Added Jest test suite verifying Baker's Math logic using a Sourdough example.

### Security

- **Strict Schema:** The JSON Schema forbids unknown properties by default to prevent data pollution.
