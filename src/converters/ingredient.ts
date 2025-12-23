import { Ingredient, ParsedIngredient, Quantity } from '../types';
import { parseIngredient } from '../parsers/ingredient';

export function parseIngredientLine(line: string): Ingredient {
  const parsed = parseIngredient(line);

  const ingredient: Ingredient = {
    name: parsed.name || line,
    scaling: parsed.scaling ?? { mode: 'linear' }
  };

  if (parsed.name) {
    ingredient.name = parsed.name;
  }

  if (parsed.prep) {
    ingredient.prep = parsed.prep;
  }

  if (parsed.optional) {
    ingredient.optional = true;
  }

  if (parsed.notes) {
    ingredient.notes = parsed.notes;
  }

  const quantity = buildQuantity(parsed.quantity);
  if (quantity) {
    ingredient.quantity = quantity;
  }

  return ingredient;
}

function buildQuantity(
  parsedQuantity: ParsedIngredient['quantity']
): Quantity | undefined {
  if (!parsedQuantity) {
    return undefined;
  }

  if (parsedQuantity.amount === null || Number.isNaN(parsedQuantity.amount)) {
    return undefined;
  }

  return {
    amount: parsedQuantity.amount,
    unit: parsedQuantity.unit ?? null
  };
}
