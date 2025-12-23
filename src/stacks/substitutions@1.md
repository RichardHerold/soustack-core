# substitutions@1

## Purpose
The `substitutions@1` stack enables recipes to declare ingredient substitutions with alternatives and ratios.

## Adds
- Top-level `substitutions` array with substitution objects.
- Each substitution includes `for` (ingredient ID) and `alternatives` array.
- Each alternative includes `name` and `ratio` fields.

## Requires
- `referenced@1`

## Semantics
- MUST: The `for` field must reference an ingredient ID that exists in the ingredients array.
- MUST: Each substitution must include at least one alternative.
- NOTE: This stack requires `referenced@1` to ensure ingredient IDs are available for reference.

## Composition Notes
- This stack is monotonic: it adds requirements or fields without removing expressiveness.
- Interaction: Requires `referenced@1` for ingredient ID resolution. Substitutions are informational and do not affect recipe structure.



