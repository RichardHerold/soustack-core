import { validateRecipe } from '../src/validator';

describe('validateRecipe modes', () => {
  const baseRecipe = {
    '@type': 'Recipe',
    profile: 'lite',
    name: 'Mode Test',
    yield: { amount: 1, unit: 'serving' },
    time: { total: { minutes: 10 } },
    ingredients: ['Flour'],
    instructions: [{ id: 'step-1', text: 'First step' }],
  };

  const conformanceRecipe = {
    '@type': 'Recipe',
    profile: 'lite',
    name: 'Conformance Test',
    yield: { amount: 1, unit: 'serving' },
    time: { total: { minutes: 10 } },
    ingredients: ['Flour'],
    instructions: [
      { id: 'step-1', text: 'First step' },
      { id: 'step-2', text: 'Second step', dependsOn: ['missing-step'] },
    ],
  };

  it('schema-only mode skips conformance checks', () => {
    const result = validateRecipe(conformanceRecipe, { mode: 'schema' });
    expect(result.ok).toBe(true);
    expect(result.conformanceIssues).toHaveLength(0);
  });

  it('full mode includes conformance issues when applicable', () => {
    const result = validateRecipe(conformanceRecipe, { mode: 'full' });
    expect(result.ok).toBe(false);
    expect(result.schemaErrors).toHaveLength(0);
    expect(result.conformanceIssues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'DAG_MISSING_NODE' })]),
    );
  });

  it('returns a stable output shape', () => {
    const result = validateRecipe(baseRecipe);
    expect(result).toMatchInlineSnapshot(`
{
  "conformanceIssues": [],
  "normalizedRecipe": {
    "@type": "Recipe",
    "ingredients": [
      "Flour",
    ],
    "instructions": [
      {
        "id": "step-1",
        "text": "First step",
      },
    ],
    "name": "Mode Test",
    "profile": "lite",
    "stacks": {},
    "time": {
      "total": {
        "minutes": 10,
      },
    },
    "yield": {
      "amount": 1,
      "unit": "serving",
    },
  },
  "ok": true,
  "schemaErrors": [],
  "warnings": [],
}
`);
  });
});
