# soustack validate

Generated from `soustack validate --help`. Do not edit manually.

```text
Usage: soustack validate <fileOrGlob> [options]

Validate recipe files against schema and conformance rules.

Options:
  --profile <name>     Validate against a specific profile
  --force-profile      Override recipe profile with --profile value
  --schema-only        Only validate against JSON schema
  --strict             Treat warnings as errors
  --json               Output results as JSON

Example:
  soustack validate "**/*.soustack.json" --profile scalable --strict
```
