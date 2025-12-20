import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SPEC_DIR = path.join(ROOT_DIR, 'spec');

function readSpecVersion() {
  const versionFile = path.join(SPEC_DIR, 'SOUSTACK_SPEC_VERSION');
  if (!fs.existsSync(versionFile)) {
    throw new Error('spec/SOUSTACK_SPEC_VERSION is missing. Run npm run sync:spec.');
  }

  const version = fs.readFileSync(versionFile, 'utf8').trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`spec/SOUSTACK_SPEC_VERSION is invalid: ${version}`);
  }

  return version;
}

function readExportedVersion() {
  const modulePath = path.join(ROOT_DIR, 'src', 'specVersion.ts');
  if (!fs.existsSync(modulePath)) {
    throw new Error('src/specVersion.ts is missing. Run npm run sync:spec.');
  }

  const contents = fs.readFileSync(modulePath, 'utf8');
  const match = contents.match(/SOUSTACK_SPEC_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!match) {
    throw new Error('Could not parse SOUSTACK_SPEC_VERSION from src/specVersion.ts');
  }

  return match[1];
}

function extractVersionFromSchema(schemaPath) {
  const contents = fs.readFileSync(schemaPath, 'utf8');
  const schema = JSON.parse(contents);
  const id = schema.$id;
  if (!id) {
    return null; // Skip schemas without $id
  }

  const match = id.match(/(?:^|[\/@_-])v?(\d+\.\d+\.\d+)(?:[\/._-]|$)/);
  if (!match) {
    return null; // Skip schemas without version in $id (component schemas)
  }

  return match[1];
}

/**
 * Recursively find all schema files in a directory
 */
function findSchemaFiles(dirPath) {
  const files = [];
  if (!fs.existsSync(dirPath)) {
    return files;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...findSchemaFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.schema.json')) {
      files.push(fullPath);
    }
  }

  return files;
}

function gatherSchemaPaths() {
  const paths = [];
  const rootSchema = path.join(SPEC_DIR, 'soustack.schema.json');
  if (fs.existsSync(rootSchema)) {
    paths.push(rootSchema);
  }

  const defsDir = path.join(SPEC_DIR, 'defs');
  paths.push(...findSchemaFiles(defsDir));

  const stacksDir = path.join(SPEC_DIR, 'stacks');
  paths.push(...findSchemaFiles(stacksDir));

  return paths;
}

function main() {
  const specVersion = readSpecVersion();
  const exportedVersion = readExportedVersion();

  const mismatches = [];
  const schemaPaths = gatherSchemaPaths();
  const shouldListSchemas = process.argv.includes('--list-schemas');
  const shouldDebugSchemas =
    process.env.SOUSTACK_SCHEMA_SCAN_DEBUG === '1' || process.env.SOUSTACK_SCHEMA_SCAN_DEBUG === 'true';

  if (shouldDebugSchemas) {
    const sampleSize = Math.min(5, schemaPaths.length);
    const sample = schemaPaths
      .slice(0, sampleSize)
      .map((schemaPath) => path.relative(ROOT_DIR, schemaPath));
    console.log(`Schema scan: ${schemaPaths.length} file(s) found.`);
    if (sample.length > 0) {
      console.log('Schema sample:');
      sample.forEach((schemaPath) => console.log(`- ${schemaPath}`));
    }
  }

  if (shouldListSchemas) {
    console.log('Collected schema paths:');
    schemaPaths
      .map((schemaPath) => path.relative(ROOT_DIR, schemaPath))
      .forEach((schemaPath) => console.log(`- ${schemaPath}`));
  }

  if (specVersion !== exportedVersion) {
    mismatches.push(`src/specVersion.ts exports ${exportedVersion} but spec/SOUSTACK_SPEC_VERSION is ${specVersion}`);
  }

  schemaPaths.forEach((schemaPath) => {
    const schemaVersion = extractVersionFromSchema(schemaPath);
    if (schemaVersion === null) {
      // Skip schemas without versions (component schemas like base.schema.json, profiles, modules)
      return;
    }
    if (schemaVersion !== specVersion) {
      mismatches.push(`${path.relative(ROOT_DIR, schemaPath)} declares version ${schemaVersion} but spec version is ${specVersion}`);
    }
  });

  if (mismatches.length > 0) {
    mismatches.forEach((message) => console.error(message));
    process.exit(1);
  }

  console.log('No Soustack spec version drift detected.');
}

main();
