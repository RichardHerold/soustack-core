import { Recipe, Instruction, Ingredient, IngredientItem, InstructionItem } from "../types";
import { SOUSTACK_SPEC_VERSION } from "../specVersion";

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

  // Check scaling sanity (baker's percentage references, discrete min/max)
  issues.push(...checkScalingSanity(recipe));

  // Check equipment references
  issues.push(...checkEquipmentReferences(recipe));

  // Check referenced stack input resolution
  issues.push(...checkReferencedInputs(recipe));

  // Check timed duration range sanity
  issues.push(...checkTimedDurationRanges(recipe));

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
    const schedulableSchema = `http://soustack.org/schema/v${SOUSTACK_SPEC_VERSION}/profiles/schedulable`;
    // Check for schedulable profile schema ID
    return (
      schema.includes("schedulable") ||
      schema === schedulableSchema
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
 * - Discrete scaling min must be <= max
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

      // Handle both legacy format (has "item" property) and new format (has "id" property)
      if (isIngredient(item)) {
        if (typeof item.id === "string") {
          ingredientIds.add(item.id);
        }
      } else if (item && typeof item === "object" && !Array.isArray(item) && typeof item !== "string") {
        // Handle new format ingredients (have id/name/quantity, not item property)
        const itemAny = item as any;
        if ("id" in itemAny && typeof itemAny.id === "string") {
          ingredientIds.add(itemAny.id);
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

    // Handle both legacy format (has "item" property) and new format (has "id" property)
    if (isIngredient(item) || (item && typeof item === "object" && !Array.isArray(item) && typeof item !== "string" && "id" in item)) {
      const itemAny = item as any;
      const scaling = itemAny.scaling;
      // Check for bakersPercent mode (new schema format) or bakers_percentage type (legacy format)
      const isBakersPercent = scaling &&
        typeof scaling === "object" &&
        (("mode" in scaling && scaling.mode === "bakersPercent") ||
         ("type" in scaling && scaling.type === "bakers_percentage"));
      
      if (isBakersPercent) {
        // Handle both new format (mode: "bakersPercent", of: string) and legacy format (type: "bakers_percentage", referenceId: string)
        const bakersScaling = scaling as any;
        const referenceId = bakersScaling.of || bakersScaling.referenceId;
        
        if (referenceId) {
          if (!ingredientIds.has(referenceId)) {
            issues.push({
              code: "SCALING_INVALID_REFERENCE",
              path: `${path}/scaling/${bakersScaling.of ? "of" : "referenceId"}`,
              message: `Baker's percentage references missing ingredient id '${referenceId}'.`,
              severity: "error",
            });
          }
        } else {
          issues.push({
            code: "SCALING_MISSING_REFERENCE",
            path: `${path}/scaling`,
            message: "Baker's percentage scaling requires an 'of' field (or 'referenceId' for legacy format).",
            severity: "error",
          });
        }
      }
    }
  };

  ingredients.forEach((item, index) => {
    checkIngredient(item, `/ingredients/${index}`);
  });

  // Check recipe-level discrete scaling min/max sanity
  const recipeAny = recipe as any;
  if (recipeAny.scaling && typeof recipeAny.scaling === "object") {
    const scaling = recipeAny.scaling;
    if (scaling.discrete && typeof scaling.discrete === "object") {
      const discrete = scaling.discrete;
      if (typeof discrete.min === "number" && typeof discrete.max === "number") {
        if (discrete.min > discrete.max) {
          issues.push({
            code: "SCALING_INVALID_RANGE",
            path: "/scaling/discrete",
            message: `Discrete scaling min (${discrete.min}) must be <= max (${discrete.max}).`,
            severity: "error",
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Validates equipment references:
 * - usesEquipment references in instructions must point to valid equipment IDs
 * - mise-en-place equipment references must point to valid equipment IDs
 * - mise-en-place input references must point to valid ingredient IDs
 */
function checkEquipmentReferences(recipe: Recipe): ConformanceIssue[] {
  const issues: ConformanceIssue[] = [];
  
  // Collect all equipment IDs
  const equipmentIds = new Set<string>();
  if (Array.isArray(recipe.equipment)) {
    recipe.equipment.forEach((eq) => {
      if (eq && typeof eq === "object" && "id" in eq && typeof eq.id === "string") {
        equipmentIds.add(eq.id);
      }
    });
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

      // Handle both legacy format (has "item" property) and new format (has "id" property)
      // Referenced/quantified stacks use IngredientBase which has "id" and "name", not "item"
      if (isIngredient(item)) {
        if (typeof item.id === "string") {
          ingredientIds.add(item.id);
        }
      } else if (item && typeof item === "object" && !Array.isArray(item) && typeof item !== "string") {
        // Handle ingredient objects from referenced/quantified stacks
        // TypeScript narrows item to never after isIngredient, so we need to check again
        const itemAny = item as any;
        if ("id" in itemAny && typeof itemAny.id === "string") {
          ingredientIds.add(itemAny.id);
        }
      }
    });
  };

  if (Array.isArray(recipe.ingredients)) {
    collectIngredientIds(recipe.ingredients, "/ingredients");
  }

  // Check usesEquipment references in instructions
  const checkInstruction = (item: InstructionItem, path: string): void => {
    // Handle step sections (structured stack)
    if (isStepSection(item)) {
      if (Array.isArray(item.steps)) {
        item.steps.forEach((step, index) => {
          checkInstruction(step, `${path}/steps/${index}`);
        });
      }
      return;
    }

    // Handle instruction subsections (legacy)
    if (isInstructionSubsection(item)) {
      if (Array.isArray(item.items)) {
        item.items.forEach((step, index) => {
          checkInstruction(step, `${path}/items/${index}`);
        });
      }
      return;
    }

    // Handle actual instruction/step
    if (isInstruction(item)) {
      const step = item as any; // Use any to access dynamic properties
      
      if (Array.isArray(step.usesEquipment)) {
        step.usesEquipment.forEach((eqId: string, index: number) => {
          if (typeof eqId === "string" && !equipmentIds.has(eqId)) {
            issues.push({
              code: "EQUIPMENT_UNKNOWN_REFERENCE",
              path: `${path}/usesEquipment/${index}`,
              message: `Equipment reference '${eqId}' does not exist in recipe equipment.`,
              severity: "error",
            });
          }
        });
      }

      // Check mise-en-place equipment references
      if (step.miseEnPlace && typeof step.miseEnPlace === "object") {
        const mep = step.miseEnPlace as any;
        if (Array.isArray(mep.equipment)) {
          mep.equipment.forEach((eqId: any, index: number) => {
            if (typeof eqId === "string" && !equipmentIds.has(eqId)) {
              issues.push({
                code: "EQUIPMENT_UNKNOWN_REFERENCE",
                path: `${path}/miseEnPlace/equipment/${index}`,
                message: `Mise-en-place equipment reference '${eqId}' does not exist in recipe equipment.`,
                severity: "error",
              });
            }
          });
        }

        // Check mise-en-place input references
        if (Array.isArray(mep.inputs)) {
          mep.inputs.forEach((inputId: any, index: number) => {
            if (typeof inputId === "string" && !ingredientIds.has(inputId)) {
              issues.push({
                code: "MISE_EN_PLACE_UNKNOWN_INPUT",
                path: `${path}/miseEnPlace/inputs/${index}`,
                message: `Mise-en-place input reference '${inputId}' does not exist in recipe ingredients.`,
                severity: "error",
              });
            }
          });
        }
      }
    }
  };

  if (Array.isArray(recipe.instructions)) {
    recipe.instructions.forEach((item, index) => {
      checkInstruction(item, `/instructions/${index}`);
    });
  }

  // Check top-level miseEnPlace array
  const recipeAny = recipe as any;
  if (Array.isArray(recipeAny.miseEnPlace)) {
    recipeAny.miseEnPlace.forEach((mepItem: any, index: number) => {
      if (mepItem && typeof mepItem === "object") {
        // Check equipment references in miseEnPlace
        if (Array.isArray(mepItem.usesEquipment)) {
          mepItem.usesEquipment.forEach((eqId: string, eqIndex: number) => {
            if (typeof eqId === "string" && !equipmentIds.has(eqId)) {
              issues.push({
                code: "EQUIPMENT_UNKNOWN_REFERENCE",
                path: `/miseEnPlace/${index}/usesEquipment/${eqIndex}`,
                message: `Mise-en-place equipment reference '${eqId}' does not exist in recipe equipment.`,
                severity: "error",
              });
            }
          });
        }

        // Check input references in miseEnPlace
        if (Array.isArray(mepItem.inputs)) {
          mepItem.inputs.forEach((inputId: string, inputIndex: number) => {
            if (typeof inputId === "string" && !ingredientIds.has(inputId)) {
              issues.push({
                code: "MISE_EN_PLACE_UNKNOWN_INPUT",
                path: `/miseEnPlace/${index}/inputs/${inputIndex}`,
                message: `Mise-en-place input reference '${inputId}' does not exist in recipe ingredients.`,
                severity: "error",
              });
            }
          });
        }
      }
    });
  }

  return issues;
}

/**
 * Validates referenced stack input resolution:
 * - Steps with referenced stack must have inputs array
 * - Input IDs must resolve to valid ingredient IDs
 */
function checkReferencedInputs(recipe: Recipe): ConformanceIssue[] {
  const issues: ConformanceIssue[] = [];
  const recipeAny = recipe as any;
  
  // Check if referenced stack is declared
  const stacks = recipeAny.stacks;
  if (!stacks || typeof stacks !== "object" || !stacks.referenced) {
    return issues; // No referenced stack, skip check
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

      // Handle both legacy format (has "item" property) and new format (has "id" property)
      if (isIngredient(item)) {
        if (typeof item.id === "string") {
          ingredientIds.add(item.id);
        }
      } else if (item && typeof item === "object" && !Array.isArray(item) && typeof item !== "string") {
        const itemAny = item as any;
        if ("id" in itemAny && typeof itemAny.id === "string") {
          ingredientIds.add(itemAny.id);
        }
      }
    });
  };

  if (Array.isArray(recipe.ingredients)) {
    collectIngredientIds(recipe.ingredients, "/ingredients");
  }

  // Check instructions for referenced stack requirements
  const checkInstruction = (item: InstructionItem, path: string): void => {
    if (isStepSection(item)) {
      if (Array.isArray(item.steps)) {
        item.steps.forEach((step, index) => {
          checkInstruction(step, `${path}/steps/${index}`);
        });
      }
      return;
    }

    if (isInstructionSubsection(item)) {
      if (Array.isArray(item.items)) {
        item.items.forEach((step, index) => {
          checkInstruction(step, `${path}/items/${index}`);
        });
      }
      return;
    }

    if (isInstruction(item)) {
      const step = item as any;
      
      // Referenced stack requires inputs array
      if (!Array.isArray(step.inputs)) {
        issues.push({
          code: "REFERENCED_MISSING_INPUTS",
          path: path,
          message: "Referenced stack requires steps to have an 'inputs' array.",
          severity: "error",
        });
      } else {
        // Check that all input IDs resolve to valid ingredient IDs
        step.inputs.forEach((inputId: any, index: number) => {
          if (typeof inputId === "string") {
            if (!ingredientIds.has(inputId)) {
              issues.push({
                code: "REFERENCED_INVALID_INPUT",
                path: `${path}/inputs/${index}`,
                message: `Referenced input '${inputId}' does not exist in recipe ingredients.`,
                severity: "error",
              });
            }
          }
        });
      }
    }
  };

  if (Array.isArray(recipe.instructions)) {
    recipe.instructions.forEach((item, index) => {
      checkInstruction(item, `/instructions/${index}`);
    });
  }

  return issues;
}

/**
 * Validates timed duration range sanity:
 * - DurationRange minMinutes must be <= maxMinutes
 */
function checkTimedDurationRanges(recipe: Recipe): ConformanceIssue[] {
  const issues: ConformanceIssue[] = [];
  const recipeAny = recipe as any;
  
  // Check if timed stack is declared
  const stacks = recipeAny.stacks;
  if (!stacks || typeof stacks !== "object" || !stacks.timed) {
    return issues; // No timed stack, skip check
  }

  // Check instructions for timed duration ranges
  const checkInstruction = (item: InstructionItem, path: string): void => {
    if (isStepSection(item)) {
      if (Array.isArray(item.steps)) {
        item.steps.forEach((step, index) => {
          checkInstruction(step, `${path}/steps/${index}`);
        });
      }
      return;
    }

    if (isInstructionSubsection(item)) {
      if (Array.isArray(item.items)) {
        item.items.forEach((step, index) => {
          checkInstruction(step, `${path}/items/${index}`);
        });
      }
      return;
    }

    if (isInstruction(item)) {
      const step = item as any;
      const timing = step.timing;
      
      if (timing && typeof timing === "object" && timing.duration) {
        const duration = timing.duration;
        // Check if it's a DurationRange (has both minMinutes and maxMinutes)
        if (typeof duration === "object" && "minMinutes" in duration && "maxMinutes" in duration) {
          const minMinutes = duration.minMinutes;
          const maxMinutes = duration.maxMinutes;
          
          if (typeof minMinutes === "number" && typeof maxMinutes === "number") {
            if (minMinutes > maxMinutes) {
              issues.push({
                code: "TIMED_INVALID_RANGE",
                path: `${path}/timing/duration`,
                message: `Timed duration minMinutes (${minMinutes}) must be <= maxMinutes (${maxMinutes}).`,
                severity: "error",
              });
            }
          }
        }
      }
    }
  };

  if (Array.isArray(recipe.instructions)) {
    recipe.instructions.forEach((item, index) => {
      checkInstruction(item, `/instructions/${index}`);
    });
  }

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

function isStepSection(item: any): item is { section: string; steps: any[] } {
  return (
    item &&
    typeof item === "object" &&
    !Array.isArray(item) &&
    "section" in item &&
    "steps" in item
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
