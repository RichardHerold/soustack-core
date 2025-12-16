export interface Quantity {
  amount: number;
  unit?: string | null;
}

export interface Ingredient {
  id?: string;
  item: string;
  quantity?: Quantity;
  name?: string;
  prep?: string;
  prepAction?: string;
  prepActions?: string[];
  form?: string;
  prepTime?: number;
  optional?: boolean;
  notes?: string;
}

export interface MiseEnPlaceTask {
  category: 'prep' | 'state' | 'measure' | 'other';
  action?: string;
  form?: string;
  items: Array<{
    ingredient: string;
    quantity?: Quantity;
    optional?: boolean;
    notes?: string;
  }>;
}

export interface MiseEnPlacePlan {
  tasks: MiseEnPlaceTask[];
  ungrouped: Ingredient[];
}

export function miseEnPlace(ingredients: Ingredient[]): MiseEnPlacePlan {
  const list = Array.isArray(ingredients) ? ingredients : [];

  const prepGroups = new Map<string, MiseEnPlaceTask>();
  const stateGroups = new Map<string, MiseEnPlaceTask>();
  let measureTask: MiseEnPlaceTask | undefined;
  let otherTask: MiseEnPlaceTask | undefined;
  const ungrouped: Ingredient[] = [];

  for (const ingredient of list) {
    if (!ingredient || typeof ingredient !== 'object') continue;

    const label = deriveIngredientLabel(ingredient);
    const quantity = normalizeQuantity(ingredient.quantity);
    const baseNotes = toDisplayString(ingredient.notes);
    const prepNotes = toDisplayString(ingredient.prep);
    const isOptional = typeof ingredient.optional === 'boolean' ? ingredient.optional : undefined;

    const buildItem = (extraNotes?: string) => {
      const item: MiseEnPlaceTask['items'][number] = {
        ingredient: label
      };

      if (quantity) {
        item.quantity = { ...quantity };
      }

      if (typeof isOptional === 'boolean') {
        item.optional = isOptional;
      }

      const notes = combineNotes(extraNotes, baseNotes);
      if (notes) {
        item.notes = notes;
      }

      return item;
    };

    let addedToTask = false;
    let hasPrepGrouping = false;

    const prepActionKeys = extractNormalizedList(ingredient.prepActions);
    if (prepActionKeys.length > 0) {
      hasPrepGrouping = true;
      for (const actionKey of prepActionKeys) {
        const task = ensureGroup(prepGroups, actionKey, () => ({
          category: 'prep',
          action: actionKey,
          items: []
        }));
        task.items.push(buildItem());
        addedToTask = true;
      }
    } else {
      const singleActionKey = normalizeKey(ingredient.prepAction);
      if (singleActionKey) {
        hasPrepGrouping = true;
        const task = ensureGroup(prepGroups, singleActionKey, () => ({
          category: 'prep',
          action: singleActionKey,
          items: []
        }));
        task.items.push(buildItem());
        addedToTask = true;
      } else if (prepNotes) {
        otherTask = otherTask ?? { category: 'other', items: [] };
        otherTask.items.push(buildItem(prepNotes));
        addedToTask = true;
      }
    }

    const formKey = normalizeKey(ingredient.form);
    const hasStateGrouping = Boolean(formKey);
    if (formKey) {
      const task = ensureGroup(stateGroups, formKey, () => ({
        category: 'state',
        form: formKey,
        items: []
      }));
      task.items.push(buildItem());
      addedToTask = true;
    }

    const shouldMeasure = Boolean(quantity) && !hasPrepGrouping && !hasStateGrouping;
    if (shouldMeasure) {
      measureTask = measureTask ?? { category: 'measure', items: [] };
      measureTask.items.push(buildItem());
      addedToTask = true;
    }

    if (!addedToTask) {
      ungrouped.push(ingredient);
    }
  }

  const tasks: MiseEnPlaceTask[] = [
    ...Array.from(prepGroups.values()).sort((a, b) => localeCompare(a.action, b.action)),
    ...Array.from(stateGroups.values()).sort((a, b) => localeCompare(a.form, b.form))
  ];

  if (measureTask) {
    tasks.push(measureTask);
  }

  if (otherTask) {
    tasks.push(otherTask);
  }

  return { tasks, ungrouped };
}

function deriveIngredientLabel(ingredient: Ingredient): string {
  return (
    toDisplayString(ingredient.item) ??
    toDisplayString(ingredient.name) ??
    toDisplayString(ingredient.id) ??
    'ingredient'
  );
}

function extractNormalizedList(values?: string[]): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = normalizeKey(value);
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(key);
    }
  }
  return result;
}

function normalizeKey(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

function toDisplayString(value?: string | null): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function combineNotes(...notes: Array<string | undefined>): string | undefined {
  const cleaned = notes.map((note) => toDisplayString(note ?? undefined)).filter(Boolean) as string[];
  if (cleaned.length === 0) {
    return undefined;
  }
  return cleaned.join(' | ');
}

function normalizeQuantity(quantity?: Quantity | null): Quantity | undefined {
  if (!quantity || typeof quantity !== 'object') {
    return undefined;
  }
  const amount = (quantity as Quantity).amount;
  if (typeof amount !== 'number' || Number.isNaN(amount)) {
    return undefined;
  }
  const normalized: Quantity = { amount };
  if ('unit' in quantity) {
    const unit = (quantity as Quantity).unit;
    if (typeof unit === 'string') {
      const trimmed = unit.trim();
      if (trimmed) {
        normalized.unit = trimmed;
      }
    } else if (unit === null) {
      normalized.unit = null;
    }
  }
  return normalized;
}

function ensureGroup(
  map: Map<string, MiseEnPlaceTask>,
  key: string,
  factory: () => MiseEnPlaceTask
): MiseEnPlaceTask {
  let task = map.get(key);
  if (!task) {
    task = factory();
    map.set(key, task);
  }
  return task;
}

function localeCompare(left?: string, right?: string): number {
  return (left ?? '').localeCompare(right ?? '');
}
