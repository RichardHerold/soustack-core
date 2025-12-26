# referenced@1

## Purpose
The `referenced@1` stack enables steps to explicitly reference ingredient IDs, creating clear input-output relationships for planning and validation.

## Adds
- Step objects must include an `inputs` array with at least one ingredient ID reference.
- Ingredient objects must include `id` fields.

## Requires
- `structured@1`

## Semantics
- MUST: Each step must include an `inputs` array with at least one element.
- MUST: All ingredient IDs referenced in step `inputs` must exist in the ingredients array.
- NOTE: This stack implies `structured@1` (steps are objects with IDs).

## Composition Notes
- This stack is monotonic: it adds requirements or fields without removing expressiveness.
- Interaction: Required by `substitutions@1` for substitution target resolution. Works with `prep@1` for mise en place task references.



