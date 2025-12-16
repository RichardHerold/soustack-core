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
    throw new Error(`${schemaPath} is missing a $id`);
  }

  const match = id.match(/v(\d+\.\d+\.\d+)/);
  if (!match) {
    throw new Error(`${schemaPath} has an unparseable version in $id: ${id}`);
  }

  return match[1];
}

function gatherSchemaPaths() {
  const paths = [path.join(SPEC_DIR, 'soustack.schema.json')];
  const profilesDir = path.join(SPEC_DIR, 'profiles');
  if (fs.existsSync(profilesDir)) {
    fs.readdirSync(profilesDir)
      .filter((file) => file.endsWith('.schema.json'))
      .forEach((file) => paths.push(path.join(profilesDir, file)));
  }

  return paths;
}

function main() {
  const specVersion = readSpecVersion();
  const exportedVersion = readExportedVersion();

  const mismatches = [];

  if (specVersion !== exportedVersion) {
    mismatches.push(`src/specVersion.ts exports ${exportedVersion} but spec/SOUSTACK_SPEC_VERSION is ${specVersion}`);
  }

  gatherSchemaPaths().forEach((schemaPath) => {
    const schemaVersion = extractVersionFromSchema(schemaPath);
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
