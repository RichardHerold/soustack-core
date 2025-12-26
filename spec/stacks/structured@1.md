# structured@1

## Purpose
The `structured@1` stack requires that instruction steps are structured objects with stable IDs, enabling cross-referencing, timing, and programmatic manipulation.

## Adds
- Top-level `instructions` array with structured step objects containing `id` and `text` fields.
- Steps may include `dependsOn`, `inputs`, `techniqueIds`, `usesEquipment`, `temperature`, `timing`, `images`, `videos`, and `metadata`.
- Support for nested step sections.

## Requires
- None

## Semantics
- MUST: Each step object must include `id` and `text` fields.
- MUST: Step IDs must be unique within the instructions array.
- NOTE: This stack is a prerequisite for `timed@1` and `referenced@1`.

## Composition Notes
- This stack is monotonic: it adds requirements or fields without removing expressiveness.
- Interaction: Required by `timed@1` and `referenced@1`. Enables equipment references when combined with `equipment@1`.



