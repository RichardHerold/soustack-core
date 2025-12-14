import Ajv from "ajv";
import schema from "./soustack.schema.json"; // Loads the rules
import { Recipe } from "./types";

const ajv = new Ajv();
const validate = ajv.compile(schema);

/**
 * Validates a recipe object against the Soustack Standard.
 * Returns true if valid, throws error if invalid.
 */
export function validateRecipe(data: any): data is Recipe {
  const isValid = validate(data);
  if (!isValid) {
    throw new Error(JSON.stringify(validate.errors, null, 2));
  }
  return true;
}