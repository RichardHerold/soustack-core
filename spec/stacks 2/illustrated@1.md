# illustrated@1

## Purpose
The `illustrated@1` stack enables recipes to include media (images and videos) at the recipe and step levels for visual guidance.

## Adds
- Top-level `images` and `videos` arrays (optional).
- Step objects may include `images` and `videos` arrays.
- Steps are structured objects with `id` fields.

## Requires
- None

## Semantics
- MUST: At least one media item (image or video) must be present at the recipe level or in at least one step.
- MUST: Step objects must include `id` fields (steps are structured).
- NOTE: Media URIs must be valid according to the URI schema definition.

## Composition Notes
- This stack is monotonic: it adds requirements or fields without removing expressiveness.
- Interaction: Works with `structured@1` for step-level media. No dependencies on other stacks.



