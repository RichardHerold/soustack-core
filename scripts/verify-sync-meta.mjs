import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SPEC_REPO, getRequiredSpecFiles } from './schema-artifacts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SPEC_DIR = path.join(ROOT_DIR, 'spec');
const META_PATH = path.join(SPEC_DIR, '.sync-meta.json');
const VERSION_FILE_PATH = path.join(SPEC_DIR, 'SOUSTACK_SPEC_VERSION');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing expected file: ${path.relative(ROOT_DIR, filePath)}`);
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    const reason = error instanceof SyntaxError ? `invalid JSON (${error.message})` : error.message;
    throw new Error(`Failed to parse ${path.relative(ROOT_DIR, filePath)}: ${reason}`);
  }
}

function sha256(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function validateChecksums(files, checksumMap) {
  Object.entries(checksumMap).forEach(([relativePath, expectedHash]) => {
    assert(typeof expectedHash === 'string' && expectedHash.length > 0, `Checksum for ${relativePath} must be a non-empty string.`);

    const absolutePath = path.join(SPEC_DIR, relativePath);
    assert(fs.existsSync(absolutePath), `Checksum entry references missing file: ${relativePath}`);
    const actualHash = sha256(absolutePath);
    assert(
      actualHash === expectedHash,
      `Checksum mismatch for ${relativePath}: expected ${expectedHash}, received ${actualHash}`
    );
  });

  files.forEach((relativePath) => {
    if (!(relativePath in checksumMap)) {
      throw new Error(`Missing checksum for ${relativePath}`);
    }
  });
}

async function main() {
  const metadata = readJson(META_PATH);
  const pkg = readJson(PACKAGE_JSON_PATH);
  const specVersionFile = fs.readFileSync(VERSION_FILE_PATH, 'utf8').trim();

  assert(metadata && typeof metadata === 'object', 'Sync metadata must be an object.');
  assert(
    typeof metadata.sourceRepo === 'string' && metadata.sourceRepo.length > 0,
    'metadata.sourceRepo must be a non-empty string.'
  );
  assert(metadata.sourceRepo === SPEC_REPO, `Sync metadata repo mismatch: expected ${SPEC_REPO}.`);

  assert(typeof metadata.ref === 'string' && metadata.ref.length > 0, 'metadata.ref must be a non-empty string.');
  if (pkg.soustackSpecTag) {
    assert(
      pkg.soustackSpecTag === metadata.ref,
      `metadata.ref (${metadata.ref}) does not match package.json soustackSpecTag (${pkg.soustackSpecTag}).`
    );
  }

  assert(
    typeof metadata.syncedAt === 'string' && !Number.isNaN(Date.parse(metadata.syncedAt)),
    'metadata.syncedAt must be an ISO 8601 timestamp string.'
  );

  if (metadata.commit !== undefined && metadata.commit !== null) {
    assert(
      typeof metadata.commit === 'string' && metadata.commit.length > 0,
      'metadata.commit must be a string when present.'
    );
  }

  assert(
    typeof metadata.specVersion === 'string' && metadata.specVersion.length > 0,
    'metadata.specVersion must be a non-empty string.'
  );
  assert(
    metadata.specVersion === specVersionFile,
    `metadata.specVersion (${metadata.specVersion}) does not match spec/SOUSTACK_SPEC_VERSION (${specVersionFile}).`
  );
  if (pkg.soustackSpecVersion) {
    assert(
      metadata.specVersion === pkg.soustackSpecVersion,
      `metadata.specVersion (${metadata.specVersion}) does not match package.json soustackSpecVersion (${pkg.soustackSpecVersion}).`
    );
  }

  assert(Array.isArray(metadata.files) && metadata.files.length > 0, 'metadata.files must be a non-empty array.');
  metadata.files.forEach((relativePath) => {
    assert(typeof relativePath === 'string', 'metadata.files entries must be strings.');
    const normalized = relativePath.trim();
    assert(normalized.length > 0, 'metadata.files entries cannot be empty.');

    const absolutePath = path.join(SPEC_DIR, relativePath);
    assert(fs.existsSync(absolutePath), `metadata.files references missing file: ${relativePath}`);
  });

  // Get required files based on what's actually in the spec directory
  const requiredFiles = getRequiredSpecFiles(SPEC_DIR);
  const fileSet = new Set(metadata.files);
  
  // Check that all required files are present in metadata
  requiredFiles.forEach((requiredPath) => {
    assert(
      fileSet.has(requiredPath),
      `metadata.files is missing required entry: ${requiredPath}`
    );
  });

  if (metadata.checksums) {
    assert(
      metadata.checksums && typeof metadata.checksums === 'object',
      'metadata.checksums must be an object when provided.'
    );
    validateChecksums(metadata.files, metadata.checksums);
  }

  console.log(
    `Sync metadata verified (ref ${metadata.ref}, version ${metadata.specVersion}, ${metadata.files.length} tracked files).`
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
