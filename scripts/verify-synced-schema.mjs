import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {
  REQUIRED_MODULE_FILES,
  REQUIRED_RECIPE_PROFILE_FILES,
} from './schema-artifacts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SPEC_DIR = path.join(ROOT_DIR, 'spec');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const SPEC_PROFILES_DIR = path.join(SPEC_DIR, 'profiles');
const SRC_PROFILES_DIR = path.join(SRC_DIR, 'profiles');
const SPEC_RECIPE_SCHEMAS_DIR = path.join(SPEC_DIR, 'schemas', 'recipe');
const SRC_RECIPE_SCHEMAS_DIR = path.join(SRC_DIR, 'schemas', 'recipe');
const SPEC_REGISTRY_DIR = path.join(SPEC_DIR, 'schemas', 'registry');
const SRC_REGISTRY_DIR = path.join(SRC_DIR, 'schemas', 'registry');

const SPEC_SCHEMA_PATH = path.join(SPEC_DIR, 'soustack.schema.json');
const SRC_SCHEMA_COPIES = [
  path.join(SRC_DIR, 'soustack.schema.json'),
  path.join(SRC_DIR, 'schema.json'),
];

const ajv = new Ajv({
  allErrors: true,
  strict: false,
});
addFormats(ajv);

function relativeToRoot(filePath) {
  return path.relative(ROOT_DIR, filePath);
}

function readJson(filePath) {
  try {
    const contents = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(contents);
  } catch (error) {
    const reason = error instanceof SyntaxError ? `invalid JSON (${error.message})` : error.message;
    throw new Error(`Failed to read ${relativeToRoot(filePath)}: ${reason}`);
  }
}

function ensureFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing expected file: ${relativeToRoot(filePath)}`);
  }
}

function ensureSameContents(referencePath, candidatePath) {
  const reference = fs.readFileSync(referencePath, 'utf8');
  const candidate = fs.readFileSync(candidatePath, 'utf8');

  if (reference !== candidate) {
    throw new Error(
      `Schema copy mismatch: ${relativeToRoot(candidatePath)} differs from ${relativeToRoot(referencePath)}`
    );
  }
}

function compileSchema(filePath) {
  const schema = readJson(filePath);
  try {
    ajv.compile(schema);
  } catch (error) {
    throw new Error(
      `AJV failed to compile ${relativeToRoot(filePath)}: ${error.message || error.toString()}`
    );
  }
}

async function main() {
  ensureFileExists(SPEC_SCHEMA_PATH);

  const schemaTargets = [SPEC_SCHEMA_PATH];

  const baseRecipeSchemaPath = path.join(SPEC_RECIPE_SCHEMAS_DIR, 'base.schema.json');
  ensureFileExists(baseRecipeSchemaPath);
  schemaTargets.push(baseRecipeSchemaPath);
  ensureSameContents(
    baseRecipeSchemaPath,
    path.join(SRC_RECIPE_SCHEMAS_DIR, 'base.schema.json')
  );

  REQUIRED_RECIPE_PROFILE_FILES.forEach((filename) => {
    const specProfilePath = path.join(SPEC_RECIPE_SCHEMAS_DIR, 'profiles', filename);
    ensureFileExists(specProfilePath);
    schemaTargets.push(specProfilePath);

    const srcProfilePath = path.join(SRC_RECIPE_SCHEMAS_DIR, 'profiles', filename);
    ensureFileExists(srcProfilePath);
    ensureSameContents(specProfilePath, srcProfilePath);
  });

  REQUIRED_MODULE_FILES.forEach((filename) => {
    const specModulePath = path.join(SPEC_RECIPE_SCHEMAS_DIR, 'modules', filename);
    ensureFileExists(specModulePath);
    schemaTargets.push(specModulePath);

    const srcModulePath = path.join(SRC_RECIPE_SCHEMAS_DIR, 'modules', filename);
    ensureFileExists(srcModulePath);
    ensureSameContents(specModulePath, srcModulePath);
  });

  ['modules.json', 'profiles.json'].forEach((registryFile) => {
    const specRegistryPath = path.join(SPEC_REGISTRY_DIR, registryFile);
    ensureFileExists(specRegistryPath);
    const srcRegistryPath = path.join(SRC_REGISTRY_DIR, registryFile);
    ensureFileExists(srcRegistryPath);
    ensureSameContents(specRegistryPath, srcRegistryPath);
  });

  SRC_SCHEMA_COPIES.forEach((copyPath) => {
    ensureFileExists(copyPath);
    ensureSameContents(SPEC_SCHEMA_PATH, copyPath);
  });

  schemaTargets.forEach(compileSchema);

  console.log(
    `Verified ${schemaTargets.length} Soustack schema artifacts (${schemaTargets
      .map((filePath) => relativeToRoot(filePath))
      .join(', ')}).`
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
