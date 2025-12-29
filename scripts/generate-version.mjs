import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const VERSION_MODULE_PATH = path.join(ROOT_DIR, 'src', 'version.ts');

function readPackageVersion() {
  if (!fs.existsSync(PACKAGE_JSON_PATH)) {
    throw new Error('package.json is missing');
  }

  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  const version = pkg.version;

  if (typeof version !== 'string' || version.trim() === '') {
    throw new Error('package.json version is missing or invalid');
  }

  return version;
}

function writeVersionModule(version) {
  const content = `export const SOUSTACK_VERSION = '${version}';\n`;
  const current = fs.existsSync(VERSION_MODULE_PATH) ? fs.readFileSync(VERSION_MODULE_PATH, 'utf8') : null;

  if (current === content) {
    console.log(`src/version.ts is already up to date at ${version}`);
    return;
  }

  fs.writeFileSync(VERSION_MODULE_PATH, content);
  console.log(`Updated src/version.ts to ${version}`);
}

function main() {
  const version = readPackageVersion();
  writeVersionModule(version);
}

main();
