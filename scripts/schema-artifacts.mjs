import path from 'node:path';
import fs from 'node:fs';

export const SPEC_REPO = 'https://github.com/RichardHerold/soustack-spec.git';

/**
 * Get all schema files in a directory recursively
 * @param {string} dirPath - Directory to search
 * @param {string} basePath - Base path for relative paths
 * @returns {string[]} Array of relative paths to schema files
 */
function getSchemaFiles(dirPath, basePath = '') {
  const files = [];
  if (!fs.existsSync(dirPath)) {
    return files;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = basePath ? path.posix.join(basePath, entry.name) : entry.name;

    if (entry.isDirectory()) {
      files.push(...getSchemaFiles(fullPath, relativePath));
    } else if (entry.isFile() && entry.name.endsWith('.schema.json')) {
      files.push(relativePath);
    }
  }

  return files;
}

/**
 * Get all JSON files in a directory (non-recursive)
 * @param {string} dirPath - Directory to search
 * @param {string} basePath - Base path for relative paths
 * @returns {string[]} Array of relative paths to JSON files
 */
function getJsonFiles(dirPath, basePath = '') {
  const files = [];
  if (!fs.existsSync(dirPath)) {
    return files;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      const relativePath = basePath ? path.posix.join(basePath, entry.name) : entry.name;
      files.push(relativePath);
    }
  }

  return files;
}

/**
 * Build the list of required spec files based on the new structure.
 * This function can be called with a spec directory to discover files,
 * or used statically for validation.
 * 
 * @param {string} specDir - Optional spec directory to scan for files
 * @returns {string[]} Array of required file paths
 */
export function getRequiredSpecFiles(specDir = null) {
  const files = [
    'soustack.schema.json',
    'SOUSTACK_SPEC_VERSION',
  ];

  // If specDir is provided, discover files dynamically
  if (specDir) {
    // Add all defs/*.schema.json files
    const defsDir = path.join(specDir, 'defs');
    if (fs.existsSync(defsDir)) {
      files.push(...getSchemaFiles(defsDir, 'defs'));
    }

    // Add all stacks/*.schema.json files
    const stacksDir = path.join(specDir, 'stacks');
    if (fs.existsSync(stacksDir)) {
      files.push(...getSchemaFiles(stacksDir, 'stacks'));
      // Add stacks/registry.json if it exists
      const registryPath = path.join(stacksDir, 'registry.json');
      if (fs.existsSync(registryPath)) {
        files.push('stacks/registry.json');
      }
    }

    // Add schemas/stacks-registry.schema.json if present
    const stacksRegistrySchema = path.join(specDir, 'schemas', 'stacks-registry.schema.json');
    if (fs.existsSync(stacksRegistrySchema)) {
      files.push('schemas/stacks-registry.schema.json');
    }

    // Legacy support: if old structure exists, include those files too
    const recipeBaseSchema = path.join(specDir, 'schemas', 'recipe', 'base.schema.json');
    if (fs.existsSync(recipeBaseSchema)) {
      files.push('schemas/recipe/base.schema.json');
      // Add profile schemas
      const profilesDir = path.join(specDir, 'schemas', 'recipe', 'profiles');
      if (fs.existsSync(profilesDir)) {
        files.push(...getSchemaFiles(profilesDir, 'schemas/recipe/profiles'));
      }
      // Add module schemas
      const modulesDir = path.join(specDir, 'schemas', 'recipe', 'modules');
      if (fs.existsSync(modulesDir)) {
        files.push(...getSchemaFiles(modulesDir, 'schemas/recipe/modules'));
      }
      // Add registry files
      const registryDir = path.join(specDir, 'schemas', 'registry');
      if (fs.existsSync(registryDir)) {
        files.push(...getJsonFiles(registryDir, 'schemas/registry'));
      }
    }
  } else {
    // Static fallback: minimal expected files for new structure
    // These will be discovered during sync, but we list core ones here
    files.push(
      'stacks/registry.json',
      // Note: defs/* and stacks/*.schema.json files are discovered dynamically
      // during sync based on what exists in the source repository
    );
  }

  return files.sort();
}

// Legacy exports for backward compatibility (deprecated)
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

// Default required files (will be populated during sync)
// This is a minimal set; actual files are discovered during sync
export const REQUIRED_SPEC_FILES = [
  'soustack.schema.json',
  'SOUSTACK_SPEC_VERSION',
  'stacks/registry.json',
];
