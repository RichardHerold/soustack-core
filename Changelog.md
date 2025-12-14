# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
