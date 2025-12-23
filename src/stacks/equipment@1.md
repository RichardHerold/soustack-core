#equipment@1

---

## Purpose

The `equipment@1` stack enables recipes to declare required equipment, with optional scaling-aware counts and upgrade paths for different scale factors.

This stack is adoption-first: equipment can be declared as simple strings for minimal friction, or as structured objects with IDs for cross-referencing from steps.

---

## Requirements

A document that declares `equipment@1`:

• MUST satisfy all structural rules enabled by this stack.
• MUST satisfy the semantic rules described below.

---

## Data Model

When `equipment@1` is declared, the document MUST include a top-level `equipment` array.

### Equipment Array

The `equipment` array contains one or more items. Each item MAY be:

• A string (simple tool name)
• A structured equipment object

### Structured Equipment Object

Structured equipment objects support:

• `id` (required): unique identifier following pattern `^[A-Za-z0-9._-]+$`
• `name` (required): human-readable name
• `count` (optional): integer >= 1, default 1
• `countScaling` (optional): scaling behavior for count
• `upgrades` (optional): array of upgrade rules

---

## Scaling Behavior

Equipment scaling is defined in terms of a scale factor F. If no scaling factor exists in the document, implementations MUST treat F = 1.

### countScaling

The `countScaling` field controls how equipment count changes with scale:

#### fixed

Count remains unchanged regardless of scale factor.

```json
{
  "id": "pan",
  "name": "8-inch skillet",
  "count": 1,
  "countScaling": "fixed"
}
```

#### linear

Effective count = ceil(count × F)

```json
{
  "id": "mixing_bowl",
  "name": "Mixing bowl",
  "count": 2,
  "countScaling": "linear"
}
```

#### threshold

Pick the first step where F <= maxFactor, otherwise use the last step.

```json
{
  "id": "sheet_pan",
  "name": "Baking sheet",
  "count": 1,
  "countScaling": {
    "mode": "threshold",
    "steps": [
      { "maxFactor": 1.0, "count": 1 },
      { "maxFactor": 2.0, "count": 2 },
      { "maxFactor": 4.0, "count": 3 }
    ]
  }
}
```

The `steps` array MUST be non-empty. Steps SHOULD be in ascending order by `maxFactor` (semantic validation may enforce this in tooling).

### upgrades

The `upgrades` array allows swapping to a different equipment item at higher scale factors.

Choose the upgrade with the highest `minFactor` where `minFactor <= F`. If no upgrade matches, use the base equipment item.

```json
{
  "id": "skillet_small",
  "name": "8-inch skillet",
  "upgrades": [
    { "minFactor": 2.0, "use": "skillet_large" }
  ]
}
```

The `use` field MUST reference an equipment id that exists in the equipment array (semantic validation).

---

## Step Usage

When `structured@1` is present (steps are objects), steps MAY include an optional `usesEquipment` field.

Field
step.usesEquipment : array of equipment ids

Each id in `usesEquipment` MUST exist in the equipment array (semantic validation when both stacks are present).

Example:

```json
{
  "equipment": [
    { "id": "skillet", "name": "8-inch skillet" }
  ],
  "instructions": [
    {
      "id": "sear",
      "text": "Sear the meat",
      "usesEquipment": ["skillet"]
    }
  ]
}
```

---

## Composition

The equipment stack is composable with other stacks:

• No hard dependency on `scaling@1` (scaling behavior uses factor if present, but does not require scaling stack)
• Works with `structured@1` to enable step-level equipment references
• Remains monotonic: does not close objects needed by other stacks

---

## Semantic Validation Rules (Normative)

Validators MUST enforce the following rules:

1. Equipment id uniqueness
   All equipment object `id` values MUST be unique within the equipment array.

2. Step equipment references
   If both `equipment@1` and `structured@1` are present, and a step includes `usesEquipment`, all referenced ids MUST exist in the equipment array (as object ids, not string items).

3. Upgrade references
   If an equipment item includes `upgrades`, each `upgrades[].use` MUST reference an existing equipment object id.

4. Threshold steps ordering
   For `countScaling.mode == "threshold"`, the `steps` array SHOULD be in ascending order by `maxFactor` (tooling may warn but not fail validation).

---

## Examples

Simple strings

```json
{
  "equipment": ["mixing bowl", "whisk", "oven"]
}
```

Structured with scaling

```json
{
  "equipment": [
    {
      "id": "skillet",
      "name": "8-inch skillet",
      "count": 1,
      "countScaling": "fixed"
    },
    {
      "id": "bowl",
      "name": "Mixing bowl",
      "count": 2,
      "countScaling": "linear"
    }
  ]
}
```

With upgrades

```json
{
  "equipment": [
    {
      "id": "skillet_small",
      "name": "8-inch skillet",
      "upgrades": [
        { "minFactor": 2.0, "use": "skillet_large" }
      ]
    },
    {
      "id": "skillet_large",
      "name": "12-inch skillet"
    }
  ]
}
```

Step usage

```json
{
  "equipment": [
    { "id": "skillet", "name": "8-inch skillet" }
  ],
  "instructions": [
    {
      "id": "sear",
      "text": "Sear the meat in the skillet",
      "usesEquipment": ["skillet"]
    }
  ]
}
```

