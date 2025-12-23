#storage@1

---

## Purpose

The `storage@1` stack enables recipes to declare storage conditions and duration for prepared dishes, with optional leftovers and reheating guidance.

This stack is adoption-first: storage can be declared with minimal information, or extended with detailed leftovers and reheating instructions.

---

## Requirements

A document that declares `storage@1`:

• MUST satisfy all structural rules enabled by this stack.
• MUST satisfy the semantic rules described below.

---

## Data Model

When `storage@1` is declared, the document MUST include a top-level `storage` object.

### Storage Object

The `storage` object MUST include exactly one of:
• `roomTemp`: storage at room temperature
• `refrigerated`: storage in refrigeration
• `frozen`: storage in freezing conditions

Each storage method is a `storageMethod` object with:
• `duration` (required): ISO 8601 duration string (pattern `^P`)
• `notes` (optional): string
• `metadata` (optional): object

### Leftovers and Reheating

The `storage` object MAY include an optional `leftovers` field for leftovers and reheating guidance.

---

## Leftovers and Reheating

The `leftovers` object supports:

• `notes` (optional): string with general guidance
• `reheat` (optional): array of reheating instructions (see below)
• `portioning` (optional): portion guidance object

### Reheat Field

The `reheat` field supports two formats:

#### Simple (Array of Strings)

An array of freeform string instructions:

```json
{
  "storage": {
    "refrigerated": {
      "duration": { "iso8601": "P4D" }
    },
    "leftovers": {
      "notes": "Store in an airtight container.",
      "reheat": [
        "Microwave 2–3 minutes, stirring halfway.",
        "Or warm in a skillet over medium heat with a splash of water."
      ]
    }
  }
}
```

#### Structured (Array of Objects)

An array of structured reheating instruction objects:

```json
{
  "storage": {
    "frozen": {
      "duration": { "iso8601": "P2M" }
    },
    "leftovers": {
      "portioning": { "notes": "Cool completely, then portion into containers." },
      "reheat": [
        {
          "method": "microwave",
          "duration": { "minMinutes": 2, "maxMinutes": 3 },
          "notes": "Stir halfway."
        },
        {
          "method": "oven",
          "temp": { "value": 350, "unit": "F" },
          "notes": "Cover and heat until hot throughout."
        }
      ]
    }
  }
}
```

### Reheat Instruction Object

Each structured reheating instruction includes:

• `method` (required): string describing the reheating method (freeform in v1)
• `temp` (optional): object with `value` (number) and `unit` ("F" or "C")
• `duration` (optional): object with `minMinutes` and/or `maxMinutes` (integers >= 0)
• `notes` (optional): string

### Reheat Duration

The `duration` object supports:
• `minMinutes` (optional): integer >= 0
• `maxMinutes` (optional): integer >= 0
• At least one of `minMinutes` or `maxMinutes` must be present

If both are present, `minMinutes` should be <= `maxMinutes` (semantic validation may enforce this in tooling).

### Portioning

The `portioning` object includes:
• `notes` (required): string with portioning guidance
• `recommendedPortion` (optional): object with `quantity` (number) and `unit` (string)

---

## Semantics

### Storage Methods

Storage methods (`roomTemp`, `refrigerated`, `frozen`) are mutually exclusive. Exactly one must be present.

### Reheat Method

The `method` field in structured reheating instructions is freeform in v1. Consumers may map common values (e.g., "microwave", "oven", "stovetop") to display or planning features, but validation does not enforce specific values.

### Scaling

If no scaling factor exists in the document, leftovers guidance does not change. Leftovers guidance is not scaled by recipe scale factors.

---

## Composition

The storage stack is composable with other stacks:

• No hard dependency on other stacks
• Remains monotonic: does not close objects needed by other stacks
• `leftovers` is optional even when the stack is present

---

## Semantic Validation Rules (Normative)

Validators MUST enforce the following rules:

1. Storage method requirement
   The `storage` object MUST include exactly one of `roomTemp`, `refrigerated`, or `frozen`.

2. Duration requirement
   Each storage method object MUST include a `duration` field.

3. Reheat instruction method requirement
   If `leftovers.reheat` includes structured instruction objects, each object MUST include a `method` field.

4. Reheat duration validation
   If a `reheatInstruction.duration` includes both `minMinutes` and `maxMinutes`, `minMinutes` SHOULD be <= `maxMinutes` (tooling may warn but not fail validation).

---

## Examples

Minimal storage

```json
{
  "storage": {
    "refrigerated": {
      "duration": { "iso8601": "P3D" }
    }
  }
}
```

Storage with simple leftovers

```json
{
  "storage": {
    "refrigerated": {
      "duration": { "iso8601": "P4D" }
    },
    "leftovers": {
      "notes": "Store in an airtight container.",
      "reheat": [
        "Microwave 2–3 minutes, stirring halfway.",
        "Or warm in a skillet over medium heat with a splash of water."
      ]
    }
  }
}
```

Storage with structured reheating

```json
{
  "storage": {
    "frozen": {
      "duration": { "iso8601": "P2M" }
    },
    "leftovers": {
      "portioning": { "notes": "Cool completely, then portion into containers." },
      "reheat": [
        {
          "method": "microwave",
          "duration": { "minMinutes": 2, "maxMinutes": 3 },
          "notes": "Stir halfway."
        },
        {
          "method": "oven",
          "temp": { "value": 350, "unit": "F" },
          "notes": "Cover and heat until hot throughout."
        }
      ]
    }
  }
}
```

Storage with portioning

```json
{
  "storage": {
    "refrigerated": {
      "duration": { "iso8601": "P5D" }
    },
    "leftovers": {
      "portioning": {
        "notes": "Portion into individual servings before storing.",
        "recommendedPortion": {
          "quantity": 1,
          "unit": "cup"
        }
      }
    }
  }
}
```

