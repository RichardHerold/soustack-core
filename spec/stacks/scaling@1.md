#scaling@1

---

## Purpose

The `scaling@1` stack standardizes how ingredient quantities change when a recipe is scaled, so independent implementations produce consistent results.

This stack is intended to support the **Scalable** profile.

---

## Requirements

A document that declares `scaling@1`:

• MUST declare `quantified@1`.
• SHOULD declare `structured@1` (recommended for stable ingredient IDs).
• MUST satisfy all structural rules enabled by this stack.
• MUST satisfy the semantic rules described below.

---

## Data Model

When `scaling@1` is declared, quantified ingredients MAY include an optional `scaling` field.

Field
ingredient.scaling : ScalingRule

ScalingRule is defined in `defs/scalingRule.schema.json` and is a closed object with a required `mode`.

---

## Scaling Modes

### linear

Multiply the ingredient quantity by the scale factor.

mode = "linear"

If `scaling` is omitted, implementations MUST treat the ingredient as linear by default.

---

### fixed

Do not scale this ingredient quantity.

Examples:
• 1 bay leaf
• 1 cinnamon stick
• 1 pan

mode = "fixed"

---

### discrete

Scale using discrete increments (for example, whole eggs), with optional rounding and bounds.

Fields
• mode = "discrete"
• step (optional, > 0): discrete increment size
• rounding (optional): nearest | ceil | floor
• min (optional): minimum allowed result
• max (optional): maximum allowed result

Semantic defaults
• If step is not present, default is 1
• If rounding is not present, default is nearest

---

### toTaste

Quantity is informational and MUST NOT be mechanically scaled.

Examples:
• salt to taste
• pepper to taste

mode = "toTaste"

---

### bakersPercent

Represents the ingredient quantity as a baker’s percentage of a base ingredient (typically flour).

Fields
• mode = "bakersPercent"
• percent (> 0): percentage value (for example, 70 for 70%)
• of (string): ingredient id of the base ingredient

---

## Scale Factor

Scaling is applied using a scale factor F.

How F is selected depends on the consumer implementation:

• Some consumers may accept an explicit factor (for example, “2x”).
• Some consumers may compute F from yield changes (for example, “scale from 4 servings to 6 servings”).

This stack standardizes how ingredient rules respond to F, not how F is chosen.

---

## Semantic Validation Rules (Normative)

Validators MUST enforce the following rules:

1. Prerequisite
   If `scaling@1` is declared, `quantified@1` MUST also be declared.

2. Baker’s percent reference
   For mode = "bakersPercent", the `of` field MUST resolve to an existing ingredient id.

3. Discrete sanity
   For mode = "discrete", if both `min` and `max` are present, min MUST be less than or equal to max.

4. Closed rule objects
   ScalingRule MUST NOT contain unspecified fields. This is enforced by schema.

Consumers MUST apply the following semantic defaults:

• Missing `scaling` ⇒ treat as linear
• discrete.step default = 1
• discrete.rounding default = nearest

---

## Scaling Behavior (Normative)

Given an ingredient with base quantity amount A and scale factor F:

• linear
scaled amount = A × F

• fixed
scaled amount = A

• toTaste
scaled amount = A (informational only)
Consumers MAY hide numeric scaling UI for this item.

• discrete

1. raw = A × F
2. if step is present, units = raw ÷ step
3. apply rounding to units
4. scaled = units × step
5. clamp to min / max if present

• bakersPercent

1. let B be the amount of the ingredient referenced by `of`
2. scaled amount = B × (percent ÷ 100)

---

## Examples

Linear (default)

Ingredient
id: i_sugar
name: Sugar
quantity: 100 g
(no scaling field → treated as linear)

---

Fixed

Ingredient
id: i_bayleaf
name: Bay leaf
quantity: 1 leaf
scaling: mode = fixed

---

Discrete (eggs)

Ingredient
id: i_eggs
name: Eggs
quantity: 2 egg
scaling: mode = discrete, rounding = ceil

---

To taste

Ingredient
id: i_salt
name: Salt
quantity: 1 tsp
scaling: mode = toTaste

---

Baker’s percent

Ingredient A
id: i_flour
name: Flour
quantity: 500 g

Ingredient B
id: i_water
name: Water
quantity: 350 g
scaling: mode = bakersPercent, percent = 70, of = i_flour

---

## Fixtures

Implementations SHOULD include fixtures covering:

Valid cases
• linear default (no scaling rule)
• discrete with rounding
• fixed
• toTaste
• bakersPercent with resolvable `of`

Invalid cases
• scaling declared without quantified
• bakersPercent with missing or invalid `of`
• invalid rounding value
• discrete with min greater than max
