import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { getRequiredSpecFiles } from './schema-artifacts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SPEC_DIR = path.join(ROOT_DIR, 'spec');
const SRC_DIR = path.join(ROOT_DIR, 'src');

const SPEC_SCHEMA_PATH = path.join(SPEC_DIR, 'soustack.schema.json');
const SRC_SCHEMA_COPIES = [
  path.join(SRC_DIR, 'soustack.schema.json'),
  path.join(SRC_DIR, 'schema.json'),
];

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  // Note: Schema references ($ref) should use relative paths or be resolved
  // by pre-loading all schemas. For now, we compile each schema individually.
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

/**
 * Recursively find all schema files in a directory
 */
function findSchemaFiles(dirPath, basePath = '') {
  const files = [];
  if (!fs.existsSync(dirPath)) {
    return files;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = basePath ? path.join(basePath, entry.name) : entry.name;

    if (entry.isDirectory()) {
      files.push(...findSchemaFiles(fullPath, relativePath));
    } else if (entry.isFile() && entry.name.endsWith('.schema.json')) {
      files.push(fullPath);
    }
  }

  return files;
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

/**
 * Verify that registry JSON validates against registry schema if present
 */
function verifyRegistry(registryPath, registrySchemaPath) {
  if (!fs.existsSync(registryPath) || !fs.existsSync(registrySchemaPath)) {
    return; // Optional, skip if not present
  }

  const registry = readJson(registryPath);
  const registrySchema = readJson(registrySchemaPath);
  
  const validate = ajv.compile(registrySchema);
  const valid = validate(registry);
  
  if (!valid) {
    throw new Error(
      `Registry ${relativeToRoot(registryPath)} failed validation against ${relativeToRoot(registrySchemaPath)}: ${JSON.stringify(validate.errors, null, 2)}`
    );
  }
}

async function main() {
  ensureFileExists(SPEC_SCHEMA_PATH);

  const schemaTargets = [SPEC_SCHEMA_PATH];

  // Verify root schema copies in src
  SRC_SCHEMA_COPIES.forEach((copyPath) => {
    ensureFileExists(copyPath);
    ensureSameContents(SPEC_SCHEMA_PATH, copyPath);
  });

  // Verify new structure: defs/*.schema.json
  const specDefsDir = path.join(SPEC_DIR, 'defs');
  const srcDefsDir = path.join(SRC_DIR, 'defs');
  if (fs.existsSync(specDefsDir)) {
    const defsSchemas = findSchemaFiles(specDefsDir);
    defsSchemas.forEach((schemaPath) => {
      schemaTargets.push(schemaPath);
      const relativePath = path.relative(specDefsDir, schemaPath);
      const srcPath = path.join(srcDefsDir, relativePath);
      if (fs.existsSync(srcPath)) {
        ensureSameContents(schemaPath, srcPath);
      }
    });
  }

  // Verify new structure: stacks/*.schema.json
  const specStacksDir = path.join(SPEC_DIR, 'stacks');
  const srcStacksDir = path.join(SRC_DIR, 'stacks');
  if (fs.existsSync(specStacksDir)) {
    const stacksSchemas = findSchemaFiles(specStacksDir);
    stacksSchemas.forEach((schemaPath) => {
      schemaTargets.push(schemaPath);
      const relativePath = path.relative(specStacksDir, schemaPath);
      const srcPath = path.join(srcStacksDir, relativePath);
      if (fs.existsSync(srcPath)) {
        ensureSameContents(schemaPath, srcPath);
      }
    });

    // Verify stacks/registry.json exists and matches src copy
    const specRegistryPath = path.join(specStacksDir, 'registry.json');
    if (fs.existsSync(specRegistryPath)) {
      const srcRegistryPath = path.join(srcStacksDir, 'registry.json');
      if (fs.existsSync(srcRegistryPath)) {
        ensureSameContents(specRegistryPath, srcRegistryPath);
      }
    }
  }

  // Verify stacks-registry.schema.json if present
  const stacksRegistrySchemaPath = path.join(SPEC_DIR, 'schemas', 'stacks-registry.schema.json');
  if (fs.existsSync(stacksRegistrySchemaPath)) {
    schemaTargets.push(stacksRegistrySchemaPath);
    const srcStacksRegistrySchemaPath = path.join(SRC_DIR, 'schemas', 'stacks-registry.schema.json');
    if (fs.existsSync(srcStacksRegistrySchemaPath)) {
      ensureSameContents(stacksRegistrySchemaPath, srcStacksRegistrySchemaPath);
    }

    // Verify registry validates against schema
    const registryPath = path.join(SPEC_DIR, 'stacks', 'registry.json');
    verifyRegistry(registryPath, stacksRegistrySchemaPath);
  }

  // Legacy support: verify old structure if it exists
  const specRecipeSchemasDir = path.join(SPEC_DIR, 'schemas', 'recipe');
  const srcRecipeSchemasDir = path.join(SRC_DIR, 'schemas', 'recipe');
  if (fs.existsSync(specRecipeSchemasDir)) {
    const recipeSchemas = findSchemaFiles(specRecipeSchemasDir);
    recipeSchemas.forEach((schemaPath) => {
      schemaTargets.push(schemaPath);
      const relativePath = path.relative(specRecipeSchemasDir, schemaPath);
      const srcPath = path.join(srcRecipeSchemasDir, relativePath);
      if (fs.existsSync(srcPath)) {
        ensureSameContents(schemaPath, srcPath);
      }
    });
  }

  const specRegistryDir = path.join(SPEC_DIR, 'schemas', 'registry');
  const srcRegistryDir = path.join(SRC_DIR, 'schemas', 'registry');
  if (fs.existsSync(specRegistryDir)) {
    const registryFiles = fs.readdirSync(specRegistryDir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => path.join(specRegistryDir, file));
    
    registryFiles.forEach((registryPath) => {
      const relativePath = path.relative(specRegistryDir, registryPath);
      const srcPath = path.join(srcRegistryDir, relativePath);
      if (fs.existsSync(srcPath)) {
        ensureSameContents(registryPath, srcPath);
      }
    });
  }

  // Compile all schemas to verify they're valid and references resolve
  schemaTargets.forEach(compileSchema);

  // Compile root schema to verify all references resolve
  try {
    const rootSchema = readJson(SPEC_SCHEMA_PATH);
    ajv.compile(rootSchema);
  } catch (error) {
    throw new Error(
      `Root schema compilation failed (references may not resolve): ${error.message || error.toString()}`
    );
  }

  console.log(
    `Verified ${schemaTargets.length} Soustack schema artifacts.`
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
