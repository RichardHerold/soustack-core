import { Recipe, Instruction, Ingredient, IngredientItem, InstructionItem } from "../types";

export type ConformanceSeverity = "error" | "warning";

export interface ConformanceIssue {
  code: string;
  path: string;
  message: string;
  severity: ConformanceSeverity;
}

export interface ConformanceResult {
  ok: boolean;
  issues: ConformanceIssue[];
}

/**
 * Validates semantic conformance rules that cannot be expressed in JSON Schema.
 * This includes DAG validity, timing schedulability, and scaling sanity checks.
 */
export function validateConformance(recipe: Recipe): ConformanceResult {
  const issues: ConformanceIssue[] = [];

  // Check DAG validity for step dependencies
  issues.push(...checkDAGValidity(recipe));

  // Check timing schedulability if schedulable profile is present
  if (hasSchedulableProfile(recipe)) {
    issues.push(...checkTimingSchedulability(recipe));
  }

  // Check scaling sanity (baker's percentage references)
  issues.push(...checkScalingSanity(recipe));

  const ok = issues.filter((i) => i.severity === "error").length === 0;

  return { ok, issues };
}

/**
 * Checks if recipe uses the schedulable profile.
 * This is detected via $schema field pointing to the schedulable profile schema.
 */
function hasSchedulableProfile(recipe: Recipe): boolean {
  const schema = (recipe as any).$schema;
  if (typeof schema === "string") {
    // Check for schedulable profile schema ID
    return (
      schema.includes("schedulable") ||
      schema === "http://soustack.org/schema/v0.3.0/profiles/schedulable"
    );
  }
  return false;
}

/**
 * Validates DAG (Directed Acyclic Graph) properties of step dependencies:
 * - dependsOn references must point to valid step IDs
 * - No cycles in the dependency graph
 * - No orphaned referenced IDs (all referenced IDs must exist)
 */
function checkDAGValidity(recipe: Recipe): ConformanceIssue[] {
  const issues: ConformanceIssue[] = [];
  const instructions = recipe.instructions;
  if (!Array.isArray(instructions)) {
    return issues;
  }

  const instructionIds = new Set<string>();
  const dependencyRefs: { fromId?: string; toId: string; path: string }[] = [];

  // Collect all instruction IDs and dependencies
  const collect = (items: InstructionItem[], basePath: string) => {
    items.forEach((item, index) => {
      const currentPath = `${basePath}/${index}`;

      if (isInstructionSubsection(item)) {
        if (Array.isArray(item.items)) {
          collect(item.items, `${currentPath}/items`);
        }
        return;
      }

      if (isInstruction(item)) {
        const id = typeof item.id === "string" ? item.id : undefined;
        if (id) {
          instructionIds.add(id);
        }

        if (Array.isArray(item.dependsOn)) {
          item.dependsOn.forEach((depId, depIndex) => {
            if (typeof depId === "string") {
              dependencyRefs.push({
                fromId: id,
                toId: depId,
                path: `${currentPath}/dependsOn/${depIndex}`,
              });
            }
          });
        }
      }
    });
  };

  collect(instructions, "/instructions");

  // Check for missing referenced IDs
  dependencyRefs.forEach((ref) => {
    if (!instructionIds.has(ref.toId)) {
      issues.push({
        code: "DAG_MISSING_NODE",
        path: ref.path,
        message: `Instruction dependency references missing step id '${ref.toId}'.`,
        severity: "error",
      });
    }
  });

  // Check for cycles using DFS
  const adjacency = new Map<string, { toId: string; path: string }[]>();
  dependencyRefs.forEach((ref) => {
    if (ref.fromId && instructionIds.has(ref.fromId) && instructionIds.has(ref.toId)) {
      const list = adjacency.get(ref.fromId) ?? [];
      list.push({ toId: ref.toId, path: ref.path });
      adjacency.set(ref.fromId, list);
    }
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const detectCycles = (nodeId: string) => {
    if (visiting.has(nodeId)) {
      // Cycle detected - find the edge that completes the cycle
      return;
    }
    if (visited.has(nodeId)) {
      return;
    }

    visiting.add(nodeId);
    const neighbors = adjacency.get(nodeId) ?? [];
    neighbors.forEach((edge) => {
      if (visiting.has(edge.toId)) {
        issues.push({
          code: "DAG_CYCLE",
          path: edge.path,
          message: `Circular dependency detected involving step id '${edge.toId}'.`,
          severity: "error",
        });
        return;
      }
      detectCycles(edge.toId);
    });
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  instructionIds.forEach((id) => detectCycles(id));

  return issues;
}

/**
 * Validates timing schedulability rules for schedulable profile:
 * - Each step must be placeable on a timeline
 * - Either timing.duration exists OR completionCue includes an estimated duration
 * For now, we check that timing.duration exists (completionCue is not in the spec yet)
 */
function checkTimingSchedulability(recipe: Recipe): ConformanceIssue[] {
  const issues: ConformanceIssue[] = [];
  const instructions = recipe.instructions;
  if (!Array.isArray(instructions)) {
    return issues;
  }

  const checkInstruction = (item: InstructionItem, path: string): void => {
    if (isInstructionSubsection(item)) {
      if (Array.isArray(item.items)) {
        item.items.forEach((subItem, index) => {
          checkInstruction(subItem, `${path}/items/${index}`);
        });
      }
      return;
    }

    if (isInstruction(item)) {
      // Schedulable profile requires id and timing
      if (!item.id) {
        issues.push({
          code: "SCHEDULABLE_MISSING_ID",
          path: path,
          message: "Schedulable profile requires all instructions to have an id.",
          severity: "error",
        });
      }

      if (!item.timing) {
        issues.push({
          code: "SCHEDULABLE_MISSING_TIMING",
          path: path,
          message: "Schedulable profile requires all instructions to have timing information.",
          severity: "error",
        });
      } else if (!item.timing.duration) {
        issues.push({
          code: "SCHEDULABLE_MISSING_DURATION",
          path: `${path}/timing`,
          message: "Schedulable profile requires timing.duration for all instructions.",
          severity: "error",
        });
      }
    }
  };

  instructions.forEach((item, index) => {
    checkInstruction(item, `/instructions/${index}`);
  });

  return issues;
}

/**
 * Validates scaling sanity:
 * - Any baker's percentage references must resolve to an ingredient present in recipe
 */
function checkScalingSanity(recipe: Recipe): ConformanceIssue[] {
  const issues: ConformanceIssue[] = [];
  const ingredients = recipe.ingredients;
  if (!Array.isArray(ingredients)) {
    return issues;
  }

  // Collect all ingredient IDs
  const ingredientIds = new Set<string>();
  const collectIngredientIds = (items: IngredientItem[], basePath: string) => {
    items.forEach((item, index) => {
      const currentPath = `${basePath}/${index}`;

      if (isIngredientSubsection(item)) {
        if (Array.isArray(item.items)) {
          collectIngredientIds(item.items, `${currentPath}/items`);
        }
        return;
      }

      if (isIngredient(item)) {
        if (typeof item.id === "string") {
          ingredientIds.add(item.id);
        }
      }
    });
  };

  collectIngredientIds(ingredients, "/ingredients");

  // Check baker's percentage references
  const checkIngredient = (item: IngredientItem, path: string): void => {
    if (isIngredientSubsection(item)) {
      if (Array.isArray(item.items)) {
        item.items.forEach((subItem, index) => {
          checkIngredient(subItem, `${path}/items/${index}`);
        });
      }
      return;
    }

    if (isIngredient(item)) {
      const scaling = item.scaling;
      if (
        scaling &&
        typeof scaling === "object" &&
        "type" in scaling &&
        scaling.type === "bakers_percentage"
      ) {
        const bakersScaling = scaling as { referenceId?: string };
        if (bakersScaling.referenceId) {
          if (!ingredientIds.has(bakersScaling.referenceId)) {
            issues.push({
              code: "SCALING_INVALID_REFERENCE",
              path: `${path}/scaling/referenceId`,
              message: `Baker's percentage references missing ingredient id '${bakersScaling.referenceId}'.`,
              severity: "error",
            });
          }
        } else {
          issues.push({
            code: "SCALING_MISSING_REFERENCE",
            path: `${path}/scaling`,
            message: "Baker's percentage scaling requires a referenceId.",
            severity: "error",
          });
        }
      }
    }
  };

  ingredients.forEach((item, index) => {
    checkIngredient(item, `/ingredients/${index}`);
  });

  return issues;
}

// Type guards
function isInstruction(item: any): item is Instruction {
  return item && typeof item === "object" && !Array.isArray(item) && "text" in item;
}

function isInstructionSubsection(item: any): item is { items: any[]; subsection: string } {
  return (
    item &&
    typeof item === "object" &&
    !Array.isArray(item) &&
    "items" in item &&
    "subsection" in item
  );
}

function isIngredient(item: any): item is Ingredient {
  return item && typeof item === "object" && !Array.isArray(item) && "item" in item;
}

function isIngredientSubsection(item: any): item is { items: any[]; subsection: string } {
  return (
    item &&
    typeof item === "object" &&
    !Array.isArray(item) &&
    "items" in item &&
    "subsection" in item
  );
}

