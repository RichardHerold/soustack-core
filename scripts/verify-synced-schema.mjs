import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
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

// Use Ajv2020 for draft 2020-12 schema support
const ajv = new Ajv2020({
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

function compileSchema(filePath, schemaMap = null) {
  const schema = readJson(filePath);
  
  // Validate that schema is an object or boolean (AJV requirement)
  if (typeof schema !== 'object' && typeof schema !== 'boolean') {
    throw new Error(
      `Schema ${relativeToRoot(filePath)} must be an object or boolean, but got ${typeof schema}${Array.isArray(schema) ? ' (array)' : ''}`
    );
  }
  
  // Additional check: if it's an object, ensure it's not null or an array
  if (typeof schema === 'object' && (schema === null || Array.isArray(schema))) {
    throw new Error(
      `Schema ${relativeToRoot(filePath)} must be a valid JSON Schema object, but got ${schema === null ? 'null' : 'array'}`
    );
  }
  
  try {
    // If schema has an absolute $id, check if it's already been added
    if (schema.$id && (schema.$id.startsWith('http://') || schema.$id.startsWith('https://'))) {
      const existingSchema = ajv.getSchema(schema.$id);
      if (existingSchema) {
        // Schema already added and compiled, skip
        return;
      }
    }
    // Compile the schema (it should already be added if it has an $id)
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

  // First, add all schemas with absolute $id to AJV so they can be referenced
  // This allows schemas to reference each other via their $id
  const schemaMap = new Map();
  const addedSchemaIds = new Set();
  schemaTargets.forEach((schemaPath) => {
    const schema = readJson(schemaPath);
    // Only add schemas with absolute $id (starting with http:// or https://)
    // Skip relative $ids as they may cause conflicts and aren't useful for cross-schema references
    if (schema.$id && (schema.$id.startsWith('http://') || schema.$id.startsWith('https://'))) {
      schemaMap.set(schema.$id, schemaPath);
      try {
        // Check if schema already exists before adding
        if (!ajv.getSchema(schema.$id) && !addedSchemaIds.has(schema.$id)) {
          // addSchema automatically compiles the schema
          ajv.addSchema(schema, schema.$id);
          addedSchemaIds.add(schema.$id);
        }
      } catch (error) {
        // If schema already exists, that's okay - continue
        if (!error.message.includes('already exists')) {
          console.error(`Error adding schema ${schema.$id} from ${relativeToRoot(schemaPath)}`);
          throw error;
        }
      }
    }
  });

  // Then compile all schemas to verify they're valid and references resolve
  // Note: Schemas with absolute $id were already compiled when added above
  schemaTargets.forEach((schemaPath) => {
    try {
      const schema = readJson(schemaPath);
      // Skip compilation if schema was already added (has absolute $id and was pre-loaded)
      if (schema.$id && (schema.$id.startsWith('http://') || schema.$id.startsWith('https://'))) {
        if (ajv.getSchema(schema.$id)) {
          // Already compiled when added, skip
          return;
        }
      }
      // For schemas with relative $id or no $id, compile directly
      // Note: relative $id schemas can't be referenced by other schemas, so we just validate them
      // If schema has a relative $id, temporarily remove it to avoid conflicts
      const originalId = schema.$id;
      if (originalId && !originalId.startsWith('http://') && !originalId.startsWith('https://')) {
        delete schema.$id;
      }
      try {
        ajv.compile(schema);
      } finally {
        // Restore $id if we removed it
        if (originalId && !originalId.startsWith('http://') && !originalId.startsWith('https://')) {
          schema.$id = originalId;
        }
      }
    } catch (error) {
      console.error(`Error compiling schema: ${relativeToRoot(schemaPath)}`);
      throw error;
    }
  });

  // Compile root schema to verify all references resolve
  // Note: root schema may already be compiled if it was in schemaTargets
  try {
    const rootSchema = readJson(SPEC_SCHEMA_PATH);
    const schemaId = rootSchema.$id;
    if (schemaId && ajv.getSchema(schemaId)) {
      // Schema already compiled, skip to avoid duplicate ID error
    } else {
      ajv.compile(rootSchema);
    }
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
