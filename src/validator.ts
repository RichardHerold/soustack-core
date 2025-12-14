import Ajv from "ajv";
import addFormats from "ajv-formats"; // <--- Import this
import schema from "./schema.json";
import { Recipe } from "./types";

const ajv = new Ajv();
addFormats(ajv); // <--- Enable formats like date-time, uri, email

const validate = ajv.compile(schema);

export function validateRecipe(data: any): data is Recipe {
  const isValid = validate(data);
  if (!isValid) {
    throw new Error(JSON.stringify(validate.errors, null, 2));
  }
  return true;
}