# quantified@1

## Purpose
The `quantified@1` stack enables recipes to declare precise ingredient quantities with units, enabling scaling and computation.

## Adds
- Top-level `ingredients` array with structured ingredient objects containing `id`, `name`, and `quantity` fields.
- Ingredients may include `temperature`, `notes`, `prep`, `scaling`, and `metadata`.
- Support for nested ingredient sections.

## Requires
- None

## Semantics
- MUST: Each ingredient object must include `id`, `name`, and `quantity` fields.
- MUST: Ingredient IDs must be unique within the ingredients array.
- NOTE: This stack is a prerequisite for `scaling@1`.

## Composition Notes
- This stack is monotonic: it adds requirements or fields without removing expressiveness.
- Interaction: Required by `scaling@1` for scaling behavior. Works with `structured@1` for stable ingredient references.



