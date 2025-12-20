import { validateRecipe } from "../src/validator";
import { Recipe } from "../src/types";

describe("Conformance validation", () => {
  describe("DAG validity", () => {
    it("passes for valid dependency graph", () => {
      const recipe = {
        "@type": "Recipe",
        profile: "core",
        stacks: { schedule: 1 },
        name: "Test Recipe",
        ingredients: ["Flour"],
        instructions: [
          { id: "step-1", text: "First step" },
          { id: "step-2", text: "Second step", dependsOn: ["step-1"] },
          { id: "step-3", text: "Third step", dependsOn: ["step-2"] },
        ],
        schedule: { tasks: [] },
      } as Recipe;

      const result = validateRecipe(recipe);
      expect(result.ok).toBe(true);
      expect(result.conformanceIssues).toHaveLength(0);
    });

    it("fails when dependsOn references a missing step id", () => {
      const recipe = {
        "@type": "Recipe",
        profile: "core",
        stacks: { schedule: 1 },
        name: "Test Recipe",
        ingredients: ["Flour"],
        instructions: [
          { id: "step-1", text: "First step" },
          { id: "step-2", text: "Second step", dependsOn: ["missing-step"] },
        ],
        schedule: { tasks: [] },
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
        profile: "core",
        stacks: { schedule: 1 },
        name: "Test Recipe",
        ingredients: ["Flour"],
        instructions: [
          { id: "step-1", text: "First step", dependsOn: ["step-2"] },
          { id: "step-2", text: "Second step", dependsOn: ["step-1"] },
        ],
        schedule: { tasks: [] },
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
        $schema: "http://soustack.org/schema/v0.3.0/profiles/schedulable",
        name: "Schedulable Recipe",
        ingredients: ["Tea bag"],
        instructions: [
          {
            id: "step-1",
            text: "First step",
            timing: { duration: 10, type: "active" },
          },
          {
            id: "step-2",
            text: "Second step",
            timing: { duration: 5, type: "passive" },
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
        $schema: "http://soustack.org/schema/v0.3.0/profiles/schedulable",
        name: "Schedulable Recipe",
        ingredients: ["Tea bag"],
        instructions: [
          {
            id: "step-1",
            text: "First step",
            timing: { duration: 10, type: "active" },
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
        $schema: "http://soustack.org/schema/v0.3.0/profiles/schedulable",
        name: "Schedulable Recipe",
        ingredients: ["Tea bag"],
        instructions: [
          {
            id: "step-1",
            text: "First step",
            timing: { duration: 10, type: "active" },
          },
          {
            // Missing id
            text: "Second step",
            timing: { duration: 5, type: "active" },
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
      const recipe: Recipe = {
        "@type": "Recipe",
        profile: "core",
        name: "Bread Recipe",
        ingredients: [
          {
            id: "flour",
            item: "500g Flour",
            quantity: { amount: 500, unit: "g" },
            scaling: { type: "linear" },
          },
          {
            id: "salt",
            item: "10g Salt",
            quantity: { amount: 10, unit: "g" },
            scaling: { type: "bakers_percentage", referenceId: "flour", factor: 0.02 },
          },
        ],
        instructions: ["Mix ingredients"],
      };

      const result = validateRecipe(recipe);
      expect(result.ok).toBe(true);
      expect(result.conformanceIssues).toHaveLength(0);
    });

    it("fails when baker's percentage references missing ingredient id", () => {
      const recipe: Recipe = {
        "@type": "Recipe",
        profile: "core",
        name: "Bread Recipe",
        ingredients: [
          {
            id: "flour",
            item: "500g Flour",
            quantity: { amount: 500, unit: "g" },
            scaling: { type: "linear" },
          },
          {
            id: "salt",
            item: "10g Salt",
            quantity: { amount: 10, unit: "g" },
            scaling: { type: "bakers_percentage", referenceId: "missing-flour", factor: 0.02 },
          },
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

    it("fails when baker's percentage is missing referenceId", () => {
      const recipe: Recipe = {
        "@type": "Recipe",
        profile: "core",
        name: "Bread Recipe",
        ingredients: [
          {
            id: "salt",
            item: "10g Salt",
            quantity: { amount: 10, unit: "g" },
            scaling: { type: "bakers_percentage" } as any, // Missing referenceId
          },
        ],
        instructions: ["Mix ingredients"],
      };

      const result = validateRecipe(recipe);
      expect(result.ok).toBe(false);
      expect(result.conformanceIssues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "SCALING_MISSING_REFERENCE",
            message: expect.stringMatching(/referenceId/i),
            severity: "error",
          }),
        ])
      );
    });
  });

  describe("Combined validation", () => {
    it("distinguishes schema errors from conformance issues", () => {
      // Recipe with both schema error (missing name) and conformance issue (invalid dependency)
      const recipe: any = {
        "@type": "Recipe",
        profile: "core",
        stacks: { schedule: 1 },
        // Missing name - schema error
        ingredients: ["Flour"],
        instructions: [
          { id: "step-1", text: "First step" },
          { id: "step-2", text: "Second step", dependsOn: ["missing-step"] }, // Conformance issue
        ],
        schedule: { tasks: [] } as any,
      };

      const result = validateRecipe(recipe);
      expect(result.ok).toBe(false);

      // Should have schema errors
      expect(result.schemaErrors.some((e) => e.path.includes("name") || e.message.includes("name"))).toBe(true);

      // Conformance should be skipped when schema fails
      expect(result.conformanceIssues).toHaveLength(0);
    });

    it("validates a complex valid recipe with all semantic checks", () => {
      const recipe: Recipe = {
        "@type": "Recipe",
        $schema: "http://soustack.org/schema/v0.3.0/profiles/schedulable",
        name: "Complex Recipe",
        ingredients: [
          {
            id: "flour",
            item: "500g Flour",
            quantity: { amount: 500, unit: "g" },
            scaling: { type: "linear" },
          },
          {
            id: "salt",
            item: "10g Salt",
            quantity: { amount: 10, unit: "g" },
            scaling: { type: "bakers_percentage", referenceId: "flour", factor: 0.02 },
          },
        ],
        instructions: [
          {
            id: "mix",
            text: "Mix ingredients",
            timing: { duration: 5, type: "active" },
          },
          {
            id: "knead",
            text: "Knead dough",
            dependsOn: ["mix"],
            timing: { duration: 10, type: "active" },
          },
        ],
      };

      const result = validateRecipe(recipe);
      expect(result.ok).toBe(true);
      expect(result.conformanceIssues).toHaveLength(0);
    });
  });
});
