# dietary@1

## Purpose
The `dietary@1` stack enables recipes to declare nutritional information, dietary classifications, and allergen information.

## Adds
- Top-level `dietary` object with `basis` field (perServing or perRecipe).
- Optional `calories`, `macros` (protein, fat, carbohydrates), `diets`, and `allergens` fields.
- At least one of calories, macros, diets, or allergens must be present.

## Requires
- None

## Semantics
- MUST: The `dietary` object must include a `basis` field.
- MUST: At least one of `calories`, `macros`, `diets`, or `allergens` must be present.
- NOTE: Dietary tags and allergen lists are freeform strings in v1 (no controlled vocabulary).

## Composition Notes
- This stack is monotonic: it adds requirements or fields without removing expressiveness.
- Interaction: No dependencies on other stacks. Can be combined with any other stack.



