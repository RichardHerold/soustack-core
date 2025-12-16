import path from 'node:path';

export const SPEC_REPO = 'https://github.com/RichardHerold/soustack-spec.git';

export const REQUIRED_RECIPE_PROFILE_FILES = [
  'core.schema.json',
  'minimal.schema.json',
];

export const REQUIRED_MODULE_FILES = [
  'attribution/1.schema.json',
  'taxonomy/1.schema.json',
  'media/1.schema.json',
  'nutrition/1.schema.json',
  'times/1.schema.json',
  'schedule/1.schema.json',
];

export const REQUIRED_SPEC_FILES = [
  'soustack.schema.json',
  'SOUSTACK_SPEC_VERSION',
  'schemas/recipe/base.schema.json',
  ...REQUIRED_RECIPE_PROFILE_FILES.map((filename) =>
    path.posix.join('schemas/recipe/profiles', filename)
  ),
  ...REQUIRED_MODULE_FILES.map((filename) =>
    path.posix.join('schemas/recipe/modules', filename)
  ),
  'schemas/registry/modules.json',
  'schemas/registry/profiles.json',
];
