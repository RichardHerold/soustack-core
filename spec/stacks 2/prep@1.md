#prep@1

---

## Purpose

The `prep@1` stack enables recipes to include preparation guidance at both the ingredient level and as explicit mise en place tasks. This makes recipes more operational by providing clear prep instructions and planning checklists.

This stack is adoption-first: ingredient prep can be simple strings for minimal friction, or structured objects for more detailed guidance.

---

## Requirements

A document that declares `prep@1`:

• MUST satisfy all structural rules enabled by this stack.
• MUST satisfy the semantic rules described below.

---

## Data Model

When `prep@1` is declared, the document MUST include a top-level `miseEnPlace` array.

### Mise En Place Array

The `miseEnPlace` array contains one or more tasks. Each task is a structured object that describes a prep step.

### Ingredient-Level Prep

Ingredient objects MAY include an optional `prep` field that describes how the ingredient should be prepared. The `prep` field supports multiple formats:

• A single string (simple prep phrase)
• An array of strings (multiple prep notes)
• An array of structured prep items

---

## Ingredient Prep Formats

### String Format

A simple string describing the prep:

```json
{
  "id": "onion",
  "name": "Onion",
  "prep": "finely diced"
}
```

### Array of Strings

Multiple prep notes:

```json
{
  "id": "garlic",
  "name": "Garlic",
  "prep": ["peeled", "minced"]
}
```

### Structured Prep Items

More detailed prep instructions with verbs and details:

```json
{
  "id": "tomato",
  "name": "Tomato",
  "prep": [
    { "verb": "dice", "detail": "fine" },
    { "verb": "reserve", "detail": "half for garnish" }
  ]
}
```

Each prep item object includes:

• `verb` (required): string describing the action (freeform; no controlled vocabulary in v1)
• `detail` (optional): string providing additional context

---

## Mise En Place Tasks

### Minimal Task

A task with only required text:

```json
{
  "miseEnPlace": [
    { "text": "Finely dice the onion" },
    { "text": "Mince the garlic" }
  ]
}
```

### Task with ID

Tasks may include an optional `id` for cross-referencing:

```json
{
  "miseEnPlace": [
    { "id": "dice-onion", "text": "Finely dice the onion" },
    { "id": "mince-garlic", "text": "Mince the garlic" }
  ]
}
```

Task IDs MUST be unique within the `miseEnPlace` array (semantic validation).

### Task with Ingredient References

When `referenced@1` is present, tasks may reference ingredient IDs:

```json
{
  "miseEnPlace": [
    {
      "text": "Prepare the vegetables",
      "inputs": ["onion", "garlic"]
    }
  ]
}
```

Each id in `inputs` MUST exist in the ingredients array (semantic validation when both stacks are present).

### Task with Equipment References

When `equipment@1` is present, tasks may reference equipment IDs:

```json
{
  "miseEnPlace": [
    {
      "text": "Sharpen the knife",
      "usesEquipment": ["knife"]
    }
  ]
}
```

Each id in `usesEquipment` MUST exist in the equipment array (semantic validation when both stacks are present).

### Combined References

Tasks may include both `inputs` and `usesEquipment`:

```json
{
  "miseEnPlace": [
    {
      "text": "Dice the onion with a sharp knife",
      "inputs": ["onion"],
      "usesEquipment": ["knife"]
    }
  ]
}
```

---

## Semantics

### Prep Field

The ingredient `prep` field is descriptive and freeform. In v1, there is no controlled vocabulary for prep verbs or details. Tools may interpret these as hints for display or planning, but validation does not enforce specific values.

### Mise En Place

The `miseEnPlace` array is an explicit checklist of prep tasks. Tools may render this as a prep plan, separate from the main cooking instructions. Tasks are ordered and may be presented as a sequential checklist.

---

## Composition

The prep stack is composable with other stacks:

• No hard dependency on `referenced@1` or `equipment@1` (references are optional and only validated when those stacks are present)
• Works with `structured@1` to enable ingredient object definitions
• Remains monotonic: does not close objects needed by other stacks
• Ingredient `prep` is optional even when the stack is present

---

## Semantic Validation Rules (Normative)

Validators MUST enforce the following rules:

1. Mise en place task ID uniqueness
   If tasks include `id` values, all task IDs MUST be unique within the `miseEnPlace` array.

2. Ingredient reference resolution
   If both `prep@1` and `referenced@1` are present, and a task includes `inputs`, all referenced ingredient IDs MUST exist in the ingredients array.

3. Equipment reference resolution
   If both `prep@1` and `equipment@1` are present, and a task includes `usesEquipment`, all referenced equipment IDs MUST exist in the equipment array (as object ids, not string items).

---

## Examples

Minimal mise en place

```json
{
  "miseEnPlace": [
    { "text": "Finely dice the onion" },
    { "text": "Mince the garlic" }
  ]
}
```

Ingredient prep with strings

```json
{
  "ingredients": [
    {
      "id": "onion",
      "name": "Onion",
      "prep": "finely diced"
    },
    {
      "id": "garlic",
      "name": "Garlic",
      "prep": ["peeled", "minced"]
    }
  ]
}
```

Structured prep items

```json
{
  "ingredients": [
    {
      "id": "tomato",
      "name": "Tomato",
      "prep": [
        { "verb": "dice", "detail": "fine" },
        { "verb": "reserve", "detail": "half for garnish" }
      ]
    }
  ]
}
```

Mise en place with references

```json
{
  "equipment": [
    { "id": "knife", "name": "Chef's knife" }
  ],
  "ingredients": [
    { "id": "onion", "name": "Onion" }
  ],
  "miseEnPlace": [
    {
      "text": "Dice the onion with a sharp knife",
      "inputs": ["onion"],
      "usesEquipment": ["knife"]
    }
  ]
}
```

