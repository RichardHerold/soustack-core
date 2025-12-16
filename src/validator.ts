import Ajv, { ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import baseSchema from "./schema.json";
import soustackSchema from "./soustack.schema.json";
import baseProfileSchema from "./profiles/base.schema.json";
import cookableProfileSchema from "./profiles/cookable.schema.json";
import quantifiedProfileSchema from "./profiles/quantified.schema.json";
import illustratedProfileSchema from "./profiles/illustrated.schema.json";
import schedulableProfileSchema from "./profiles/schedulable.schema.json";
import { Recipe } from "./types";

type ProfileName = "base" | "cookable" | "quantified" | "illustrated" | "schedulable";

export interface ValidateOptions {
  profile?: ProfileName;
}

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

ajv.addSchema(baseSchema);
if ((soustackSchema as any)?.$id !== (baseSchema as any)?.$id) {
  ajv.addSchema(soustackSchema);
}

const profileSchemas: Record<ProfileName, any> = {
  base: baseProfileSchema,
  cookable: cookableProfileSchema,
  quantified: quantifiedProfileSchema,
  illustrated: illustratedProfileSchema,
  schedulable: schedulableProfileSchema,
};

const validators: Partial<Record<ProfileName, ValidateFunction>> = {};

function getValidator(profile: ProfileName): ValidateFunction {
  if (!validators[profile]) {
    validators[profile] = ajv.compile(profileSchemas[profile]);
  }
  return validators[profile]!;
}

function detectProfileFromSchema(recipe: unknown): ProfileName | undefined {
  const schemaUrl = typeof (recipe as any)?.$schema === "string" ? (recipe as any).$schema : undefined;
  if (!schemaUrl) return undefined;
  const match = schemaUrl.match(/\/profiles\/([a-z]+)\.schema\.json$/i);
  if (match) {
    const profile = match[1].toLowerCase() as ProfileName;
    if (profile in profileSchemas) {
      return profile;
    }
  }
  return undefined;
}

export function validateRecipe(data: any, options: ValidateOptions = {}): data is Recipe {
  const profile = options.profile ?? detectProfileFromSchema(data) ?? "base";
  if (!(profile in profileSchemas)) {
    throw new Error(`Unknown Soustack profile: ${profile}`);
  }

  const validate = getValidator(profile);
  const isValid = validate(data);
  if (!isValid) {
    throw new Error(JSON.stringify(validate.errors, null, 2));
  }
  return true;
}

export function validateRecipeWithProfile(data: any, profile: ProfileName): data is Recipe {
  return validateRecipe(data, { profile });
}
