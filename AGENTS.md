# Agent Instructions

These instructions apply to the entire repository.

## Always
- This is a TypeScript / Node.js project using Jest for tests.
- Make the smallest correct change that fixes the root cause.
- Prefer modifying existing code over introducing new abstractions.
- Do not change public APIs without updating documentation and changelog.
- If tests fail, reproduce locally and fix the implementation, not the test, unless the test is incorrect.
- Avoid backward-compatibility work unless explicitly requested.

## Schema-related changes
- Schema definitions live in @soustack/spec (soustack-spec repo), not soustack-core.
- soustack-core syncs schemas from @soustack/spec; do not duplicate schema logic.
- When schema changes affect conversions, update both toSchemaOrg and fromSchemaOrg tests.
- Ensure JSON schema remains valid (no duplicate keys, no invalid enums).
