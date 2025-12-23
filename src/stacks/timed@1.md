# timed@1

## Purpose
The `timed@1` stack enables recipes to include timing information for steps, supporting scheduling and time-based planning.

## Adds
- Step objects must include a `timing` field with `activity` (active/passive) and either `duration` or `completionCue`.
- Timing may include duration ranges (minMinutes/maxMinutes) or completion cues.

## Requires
- `structured@1`

## Semantics
- MUST: Each step must include a `timing` object with `activity` field.
- MUST: Each timing object must include either `duration` or `completionCue`.
- NOTE: This stack implies `structured@1` (steps are objects with IDs).

## Composition Notes
- This stack is monotonic: it adds requirements or fields without removing expressiveness.
- Interaction: Required by `compute@1` for deterministic scheduling. Works with `quantified@1` for computational recipe planning.



