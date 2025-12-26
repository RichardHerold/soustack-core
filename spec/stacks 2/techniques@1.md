# techniques@1

## Purpose
The `techniques@1` stack enables recipes to declare cooking techniques used in the recipe, with optional descriptions.

## Adds
- Top-level `techniques` array with technique objects.
- Each technique includes `id` and `name` fields, with optional `description` and `metadata`.

## Requires
- None

## Semantics
- MUST: The `techniques` array must contain at least one technique.
- MUST: Each technique must include `id` and `name` fields.
- NOTE: Technique IDs may be referenced in step `techniqueIds` arrays when `structured@1` is present.

## Composition Notes
- This stack is monotonic: it adds requirements or fields without removing expressiveness.
- Interaction: Works with `structured@1` to enable step-level technique references. No hard dependencies on other stacks.



