# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
