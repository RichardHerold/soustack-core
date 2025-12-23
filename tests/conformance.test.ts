import { validateRecipe } from "../src/validator";
import { Recipe } from "../src/types";

describe("Conformance validation", () => {
  describe("DAG validity", () => {
    it("passes for valid dependency graph", () => {
      const recipe = {
        "@type": "Recipe",
        profile: "lite",
        stacks: { structured: 1 },
        name: "Test Recipe",
        ingredients: [{ id: "flour", name: "Flour" }],
        instructions: [
          { id: "step-1", text: "First step" },
          { id: "step-2", text: "Second step", dependsOn: ["step-1"] },
          { id: "step-3", text: "Third step", dependsOn: ["step-2"] },
        ],
      } as Recipe;

      const result = validateRecipe(recipe);
      expect(result.ok).toBe(true);
      expect(result.conformanceIssues).toHaveLength(0);
    });

    it("fails when dependsOn references a missing step id", () => {
      const recipe = {
        "@type": "Recipe",
        profile: "lite",
        stacks: { structured: 1 },
        name: "Test Recipe",
        ingredients: [{ id: "flour", name: "Flour" }],
        instructions: [
          { id: "step-1", text: "First step" },
          { id: "step-2", text: "Second step", dependsOn: ["missing-step"] },
        ],
      } as Recipe;

      const result = validateRecipe(recipe);
      expect(result.ok).toBe(false);
      expect(result.conformanceIssues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "DAG_MISSING_NODE",
            message: expect.stringMatching(/missing step id/),
            severity: "error",
          }),
        ])
      );
    });

    it("fails when dependency graph contains a cycle", () => {
      const recipe = {
        "@type": "Recipe",
        profile: "lite",
        stacks: { structured: 1 },
        name: "Test Recipe",
        ingredients: [{ id: "flour", name: "Flour" }],
        instructions: [
          { id: "step-1", text: "First step", dependsOn: ["step-2"] },
          { id: "step-2", text: "Second step", dependsOn: ["step-1"] },
        ],
      } as Recipe;

      const result = validateRecipe(recipe);
      expect(result.ok).toBe(false);
      expect(result.conformanceIssues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "DAG_CYCLE",
            message: expect.stringMatching(/circular dependency|cycle/i),
            severity: "error",
          }),
        ])
      );
    });
  });

  describe("Timing schedulability", () => {
    it("passes for schedulable recipe with all timing requirements met", () => {
      const recipe: Recipe = {
        "@type": "Recipe",
        profile: "timed",
        stacks: { structured: 1, timed: 1 },
        name: "Schedulable Recipe",
        yield: { amount: 1, unit: "serving" },
        time: { total: { minutes: 15 } },
        ingredients: [{ id: "tea", name: "Tea bag" }],
        instructions: [
          {
            id: "step-1",
            text: "First step",
            timing: { activity: "active", duration: { minutes: 10 } } as any,
          },
          {
            id: "step-2",
            text: "Second step",
            timing: { activity: "passive", duration: { minutes: 5 } } as any,
          },
        ],
      };

      const result = validateRecipe(recipe);
      expect(result.ok).toBe(true);
      expect(result.conformanceIssues).toHaveLength(0);
    });

    it("fails when schedulable recipe has instruction without timing", () => {
      const recipe: Recipe = {
        "@type": "Recipe",
        profile: "timed",
        stacks: { structured: 1, timed: 1 },
        name: "Schedulable Recipe",
        yield: { amount: 1, unit: "serving" },
        time: { total: { minutes: 15 } },
        ingredients: [{ id: "tea", name: "Tea bag" }],
        instructions: [
          {
            id: "step-1",
            text: "First step",
            timing: { activity: "active", duration: { minutes: 10 } } as any,
          },
          {
            id: "step-2",
            text: "Second step",
            // Missing timing
          },
        ],
      };

      const result = validateRecipe(recipe);
      expect(result.ok).toBe(false);
      expect(result.schemaErrors.length).toBeGreaterThan(0);
      expect(result.conformanceIssues).toHaveLength(0);
    });

    it("fails when schedulable recipe has instruction without id", () => {
      const recipe: Recipe = {
        "@type": "Recipe",
        profile: "timed",
        stacks: { structured: 1, timed: 1 },
        name: "Schedulable Recipe",
        yield: { amount: 1, unit: "serving" },
        time: { total: { minutes: 15 } },
        ingredients: [{ id: "tea", name: "Tea bag" }],
        instructions: [
          {
            id: "step-1",
            text: "First step",
            timing: { activity: "active", duration: { minutes: 10 } } as any,
          },
          {
            // Missing id
            text: "Second step",
            timing: { activity: "active", duration: { minutes: 5 } } as any,
          },
        ],
      };

      const result = validateRecipe(recipe);
      expect(result.ok).toBe(false);
      expect(result.schemaErrors.length).toBeGreaterThan(0);
      expect(result.conformanceIssues).toHaveLength(0);
    });
  });

  describe("Scaling sanity", () => {
    it("passes for valid baker's percentage reference", () => {
      const recipe: any = {
        "@type": "Recipe",
        profile: "lite",
        stacks: { quantified: 1, scaling: 1 },
        name: "Bread Recipe",
        scaling: { discrete: { min: 1, max: 4, step: 1 } },
        ingredients: [
          {
            id: "flour",
            name: "Flour",
            quantity: { amount: 500, unit: "g" },
            scaling: { mode: "linear" },
          } as any,
          {
            id: "salt",
            name: "Salt",
            quantity: { amount: 10, unit: "g" },
            scaling: { mode: "bakersPercent", percent: 2, of: "flour" },
          } as any,
        ],
        instructions: ["Mix ingredients"],
      };

      const result = validateRecipe(recipe);
      expect(result.ok).toBe(true);
      expect(result.conformanceIssues).toHaveLength(0);
    });

    it("fails when baker's percentage references missing ingredient id", () => {
      const recipe: any = {
        "@type": "Recipe",
        profile: "lite",
        stacks: { quantified: 1, scaling: 1 },
        name: "Bread Recipe",
        scaling: { discrete: { min: 1, max: 4, step: 1 } },
        ingredients: [
          {
            id: "flour",
            name: "Flour",
            quantity: { amount: 500, unit: "g" },
            scaling: { mode: "linear" },
          } as any,
          {
            id: "salt",
            name: "Salt",
            quantity: { amount: 10, unit: "g" },
            scaling: { mode: "bakersPercent", percent: 2, of: "missing-flour" },
          } as any,
        ],
        instructions: ["Mix ingredients"],
      };

      const result = validateRecipe(recipe);
      expect(result.ok).toBe(false);
      expect(result.conformanceIssues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "SCALING_INVALID_REFERENCE",
            message: expect.stringMatching(/missing ingredient id|missing-flour/),
            severity: "error",
          }),
        ])
      );
    });

    it("fails when baker's percentage is missing 'of' reference", () => {
      const recipe: any = {
        "@type": "Recipe",
        profile: "lite",
        stacks: { quantified: 1, scaling: 1 },
        name: "Bread Recipe",
        yield: { amount: 1, unit: "loaf" },
        time: { total: { minutes: 60 } },
        scaling: { discrete: { min: 1, max: 4, step: 1 } },
        ingredients: [
          {
            id: "salt",
            name: "Salt",
            quantity: { amount: 10, unit: "g" },
            scaling: { mode: "bakersPercent", percent: 2 } as any, // Missing 'of'
          } as any,
        ],
        instructions: ["Mix ingredients"],
      };

      const result = validateRecipe(recipe);
      expect(result.ok).toBe(false);
      // The schema validation catches missing 'of' field, so we check for schema error
      // OR conformance issue (in case schema validation passes but conformance catches it)
      const hasSchemaError = result.schemaErrors.some(
        (e) => e.path.includes("scaling") && (e.message.includes("of") || e.message.includes("required"))
      );
      const hasConformanceIssue = result.conformanceIssues.some(
        (i) => i.code === "SCALING_MISSING_REFERENCE"
      );
      expect(hasSchemaError || hasConformanceIssue).toBe(true);
    });
  });

  describe("Combined validation", () => {
    it("distinguishes schema errors from conformance issues", () => {
      // Recipe with both schema error (wrong type for instructions) and conformance issue (invalid dependency)
      // Using wrong type (instructions: {}) that can't be fixed by normalization - should be array
      const recipe: any = {
        "@type": "Recipe",
        profile: "lite",
        stacks: { structured: 1 },
        name: "Test Recipe",
        yield: { amount: 1, unit: "serving" },
        time: { total: { minutes: 10 } },
        ingredients: [
          { id: "flour", name: "Flour" },
        ],
        instructions: {}, // Wrong type - should be array, not fixable by normalization
      };

      const result = validateRecipe(recipe);
      expect(result.ok).toBe(false);

      // Should have schema errors (wrong type for instructions - should be array)
      expect(result.schemaErrors.length).toBeGreaterThan(0);
      // Check for schema error about instructions being wrong type
      const hasSchemaError = result.schemaErrors.some(
        (e) => 
          e.path === "/instructions" || 
          e.path.includes("/instructions") ||
          e.message.toLowerCase().includes("instructions") || 
          e.message.toLowerCase().includes("array") || 
          e.keyword === "type"
      );
      expect(hasSchemaError).toBe(true);

      // Conformance should be skipped when schema fails
      expect(result.conformanceIssues).toHaveLength(0);
    });

    it("validates a complex valid recipe with all semantic checks", () => {
      const recipe: Recipe = {
        "@type": "Recipe",
        profile: "timed",
        stacks: { structured: 1, timed: 1 },
        name: "Complex Recipe",
        yield: { amount: 1, unit: "loaf" },
        time: { total: { minutes: 15 } },
        ingredients: [
          {
            id: "flour",
            name: "Flour",
            quantity: { amount: 500, unit: "g" },
            scaling: { mode: "linear" },
          },
          {
            id: "salt",
            name: "Salt",
            quantity: { amount: 10, unit: "g" },
            scaling: { mode: "bakersPercent", percent: 2, of: "flour" },
          },
        ],
        instructions: [
          {
            id: "mix",
            text: "Mix ingredients",
            timing: { activity: "active", duration: { minutes: 5 } } as any,
          },
          {
            id: "knead",
            text: "Knead dough",
            dependsOn: ["mix"],
            timing: { activity: "passive", duration: { minutes: 10 } } as any,
          },
        ],
      };

      const result = validateRecipe(recipe);
      expect(result.ok).toBe(true);
      expect(result.conformanceIssues).toHaveLength(0);
    });
  });
});
