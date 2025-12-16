import path from 'node:path';

export const SPEC_REPO = 'https://github.com/RichardHerold/soustack-spec.git';

export const REQUIRED_PROFILE_FILES = [
  'base.schema.json',
  'cookable.schema.json',
  'illustrated.schema.json',
  'quantified.schema.json',
  'scalable.schema.json',
  'schedulable.schema.json',
];

export const REQUIRED_SPEC_FILES = [
  'soustack.schema.json',
  'SOUSTACK_SPEC_VERSION',
  ...REQUIRED_PROFILE_FILES.map((filename) => path.posix.join('profiles', filename)),
];
