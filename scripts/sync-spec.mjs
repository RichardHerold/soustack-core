import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SPEC_REPO, getRequiredSpecFiles } from './schema-artifacts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SPEC_DIR = path.join(ROOT_DIR, 'spec');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');

const LOCAL_SPEC_PATH = process.env.SOUSTACK_SPEC_PATH;
const SYNC_META_PATH = path.join(SPEC_DIR, '.sync-meta.json');

function readPackageJson() {
  if (!fs.existsSync(PACKAGE_JSON_PATH)) {
    throw new Error('package.json not found');
  }

  return JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
}

function determineSpecTag(pkg) {
  const cliTag = process.argv[2];
  const envTag = process.env.SOUSTACK_SPEC_TAG;
  const pkgTag = pkg.soustackSpecTag;
  const pkgVersion = pkg.soustackSpecVersion;

  const derivedTag = pkgTag || (pkgVersion ? `v${pkgVersion}` : undefined);
  const resolvedTag = cliTag || envTag || derivedTag;

  if (!resolvedTag) {
    throw new Error('Unable to determine Soustack spec tag. Set soustackSpecTag in package.json or pass it as SOUSTACK_SPEC_TAG/CLI argument.');
  }

  return resolvedTag;
}

function cloneSpecRepository(ref) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soustack-spec-'));
  const isCommitSha = /^[0-9a-f]{7,40}$/i.test(ref);

  try {
    if (isCommitSha) {
      execSync(`git init ${tempDir}`, { stdio: 'inherit' });
      execSync(`git -C ${tempDir} remote add origin ${SPEC_REPO}`, { stdio: 'inherit' });
      execSync(`git -C ${tempDir} fetch --depth 1 origin ${ref}`, { stdio: 'inherit' });
      execSync(`git -C ${tempDir} checkout --detach FETCH_HEAD`, { stdio: 'inherit' });
    } else {
      // Try to clone the branch/tag
      try {
        execSync(`git clone --depth 1 --branch ${ref} ${SPEC_REPO} ${tempDir}`, { stdio: 'inherit' });
      } catch (cloneError) {
        // If tag doesn't exist, check if we have local schemas that match
        const specVersionFile = path.join(SPEC_DIR, 'SOUSTACK_SPEC_VERSION');
        if (fs.existsSync(specVersionFile)) {
          const currentVersion = fs.readFileSync(specVersionFile, 'utf8').trim();
          const expectedVersion = ref.replace(/^v/, ''); // Remove 'v' prefix if present
          if (currentVersion === expectedVersion) {
            // Return the local spec directory instead - warning will be printed in main()
            return SPEC_DIR;
          }
        }
        // Re-throw if we can't use local schemas
        throw cloneError;
      }
    }
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw new Error(`Failed to clone soustack-spec@${ref}: ${error.message}`);
  }

  return tempDir;
}

function getSourceCommit(sourceDir) {
  try {
    return execSync(`git -C ${sourceDir} rev-parse HEAD`, { stdio: 'pipe' }).toString().trim();
  } catch {
    return null;
  }
}

function writeSpecVersion(version) {
  const outputPath = path.join(ROOT_DIR, 'spec', 'SOUSTACK_SPEC_VERSION');
  fs.writeFileSync(outputPath, `${version}\n`);
}

function updateSpecVersionModule(version) {
  const modulePath = path.join(ROOT_DIR, 'src', 'specVersion.ts');
  const contents = `export const SOUSTACK_SPEC_VERSION = '${version}';\n`;
  fs.writeFileSync(modulePath, contents);
}

function updatePackageJson(pkg, version, tag) {
  const nextPkg = {
    ...pkg,
    soustackSpecVersion: version,
    soustackSpecTag: tag,
  };

  fs.writeFileSync(PACKAGE_JSON_PATH, `${JSON.stringify(nextPkg, null, 2)}\n`);
}

function copyIntoSpecDirectory(sourceDir) {
  fs.rmSync(SPEC_DIR, { recursive: true, force: true });
  fs.mkdirSync(SPEC_DIR, { recursive: true });

  // Copy root schema
  const rootSchema = path.join(sourceDir, 'soustack.schema.json');
  if (fs.existsSync(rootSchema)) {
    fs.copyFileSync(rootSchema, path.join(SPEC_DIR, 'soustack.schema.json'));
  }

  // Copy registry metadata (new structure)
  const registryCandidates = [
    path.join(sourceDir, 'registry.json'),
    path.join(sourceDir, 'registry', 'registry.json'),
  ];
  const registrySource = registryCandidates.find((candidate) => fs.existsSync(candidate));
  if (registrySource) {
    fs.copyFileSync(registrySource, path.join(SPEC_DIR, 'registry.json'));
  }

  // Copy defs directory (new structure)
  const defsSource = path.join(sourceDir, 'defs');
  if (fs.existsSync(defsSource)) {
    fs.cpSync(defsSource, path.join(SPEC_DIR, 'defs'), { recursive: true });
  }

  // Copy stacks directory (new structure)
  const stacksSource = path.join(sourceDir, 'stacks');
  if (fs.existsSync(stacksSource)) {
    fs.cpSync(stacksSource, path.join(SPEC_DIR, 'stacks'), { recursive: true });
  }

  // Copy schemas directory (may contain stacks-registry.schema.json)
  const schemasSource = path.join(sourceDir, 'schemas');
  if (fs.existsSync(schemasSource)) {
    fs.cpSync(schemasSource, path.join(SPEC_DIR, 'schemas'), { recursive: true });
  }

  // Copy fixtures directory
  const fixturesSource = path.join(sourceDir, 'fixtures');
  if (fs.existsSync(fixturesSource)) {
    fs.cpSync(fixturesSource, path.join(SPEC_DIR, 'fixtures'), { recursive: true });
  }

  // Copy examples directory (if present)
  const examplesSource = path.join(sourceDir, 'examples');
  if (fs.existsSync(examplesSource)) {
    fs.cpSync(examplesSource, path.join(SPEC_DIR, 'examples'), { recursive: true });
  }
}

function copySchemaIntoSrc() {
  const srcDir = path.join(ROOT_DIR, 'src');
  const schemaSource = path.join(SPEC_DIR, 'soustack.schema.json');
  const schemaTargetPaths = [
    path.join(srcDir, 'schema.json'),
    path.join(srcDir, 'soustack.schema.json'),
  ];

  schemaTargetPaths.forEach((target) => {
    fs.copyFileSync(schemaSource, target);
  });

  // Copy defs directory to src (new structure)
  const defsSource = path.join(SPEC_DIR, 'defs');
  if (fs.existsSync(defsSource)) {
    fs.rmSync(path.join(srcDir, 'defs'), { recursive: true, force: true });
    fs.mkdirSync(path.join(srcDir, 'defs'), { recursive: true });
    fs.cpSync(defsSource, path.join(srcDir, 'defs'), { recursive: true });
  }

  // Copy stacks directory to src (new structure)
  const stacksSource = path.join(SPEC_DIR, 'stacks');
  if (fs.existsSync(stacksSource)) {
    fs.rmSync(path.join(srcDir, 'stacks'), { recursive: true, force: true });
    fs.mkdirSync(path.join(srcDir, 'stacks'), { recursive: true });
    fs.cpSync(stacksSource, path.join(srcDir, 'stacks'), { recursive: true });
  }

  // Copy schemas directory (may contain stacks-registry.schema.json or legacy recipe/registry)
  const schemasSource = path.join(SPEC_DIR, 'schemas');
  if (fs.existsSync(schemasSource)) {
    // Copy entire schemas directory structure
    fs.rmSync(path.join(srcDir, 'schemas'), { recursive: true, force: true });
    fs.mkdirSync(path.join(srcDir, 'schemas'), { recursive: true });
    fs.cpSync(schemasSource, path.join(srcDir, 'schemas'), { recursive: true });
  }

  // Legacy: Copy profiles if they still exist (for backward compatibility during transition)
  const profilesSource = path.join(SPEC_DIR, 'profiles');
  if (fs.existsSync(profilesSource)) {
    fs.rmSync(path.join(srcDir, 'profiles'), { recursive: true, force: true });
    fs.cpSync(profilesSource, path.join(srcDir, 'profiles'), { recursive: true });
  }
}

function ensureSpecFilesExist(files) {
  files.forEach((relativePath) => {
    const absolutePath = path.join(SPEC_DIR, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(
        `Expected synced artifact missing: ${relativePath}. Check soustack-spec contents and rerun sync.`
      );
    }
  });
}

function createSha256(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function readSyncMetadata() {
  if (!fs.existsSync(SYNC_META_PATH)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(SYNC_META_PATH, 'utf8'));
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeysDeep(value[key]);
        return acc;
      }, {});
  }

  return value;
}

function areSyncMetadataEqual(a, b) {
  if (!a || !b) {
    return false;
  }

  const { syncedAt: _aSyncedAt, ...aRest } = a;
  const { syncedAt: _bSyncedAt, ...bRest } = b;
  const normalizedA = sortKeysDeep(aRest);
  const normalizedB = sortKeysDeep(bRest);

  return JSON.stringify(normalizedA) === JSON.stringify(normalizedB);
}

function writeSyncMetadata({ repo, ref, version, commit, files, source, previousMeta }) {
  ensureSpecFilesExist(files);
  const checksums = files.reduce((acc, relativePath) => {
    const absolutePath = path.join(SPEC_DIR, relativePath);
    acc[relativePath] = createSha256(absolutePath);
    return acc;
  }, {});

  const payload = {
    ref,
    specVersion: version,
    syncedAt: new Date().toISOString(),
    files,
    checksums,
  };

  if (source) {
    payload.source = source;
  }

  if (repo) {
    payload.sourceRepo = repo;
  }

  if (commit) {
    payload.commit = commit;
  }

  if (previousMeta && areSyncMetadataEqual(previousMeta, payload)) {
    payload.syncedAt = previousMeta.syncedAt;
  }

  fs.writeFileSync(SYNC_META_PATH, `${JSON.stringify(payload, null, 2)}\n`);
}

function readSpecVersion(specDir) {
    const versionFile = path.join(specDir, 'SOUSTACK_SPEC_VERSION');
  if (!fs.existsSync(versionFile)) {
    throw new Error('SOUSTACK_SPEC_VERSION not found in soustack-spec repository');
  }

  const version = fs.readFileSync(versionFile, 'utf8').trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Unexpected SOUSTACK_SPEC_VERSION contents: ${version}`);
  }

  return version;
}

async function main() {
  const pkg = readPackageJson();
  const specSource = process.env.SOUSTACK_SPEC_SOURCE;
  const usingNpmSpec = specSource === 'npm';
  const usingLocalSpec = Boolean(LOCAL_SPEC_PATH);
  let tag;
  let sourceDir;
  let tempLocalCopy;
  let sourceCommit;
  let version;

  if (usingNpmSpec) {
    sourceDir = path.join(ROOT_DIR, 'node_modules', 'soustack-spec');
    if (!fs.existsSync(sourceDir)) {
      throw new Error(
        'SOUSTACK_SPEC_SOURCE is set to "npm" but node_modules/soustack-spec was not found. Run npm install.'
      );
    }
    const specPackagePath = path.join(sourceDir, 'package.json');
    if (!fs.existsSync(specPackagePath)) {
      throw new Error('soustack-spec package.json not found in node_modules.');
    }
    const specPackage = JSON.parse(fs.readFileSync(specPackagePath, 'utf8'));
    if (!specPackage.version) {
      throw new Error('soustack-spec package.json is missing a version field.');
    }
    version = specPackage.version;
    tag = `v${version}`;
    console.log(`Syncing Soustack spec from npm package at ${sourceDir}`);
  } else {
    tag = determineSpecTag(pkg);
    sourceDir = usingLocalSpec
      ? path.resolve(ROOT_DIR, LOCAL_SPEC_PATH)
      : cloneSpecRepository(tag);
    const usingLocalSchemas = !usingLocalSpec && sourceDir === SPEC_DIR;

    if (usingLocalSpec && sourceDir === SPEC_DIR && !usingLocalSchemas) {
      tempLocalCopy = fs.mkdtempSync(path.join(os.tmpdir(), 'soustack-spec-local-'));
      fs.cpSync(sourceDir, tempLocalCopy, { recursive: true });
      sourceDir = tempLocalCopy;
    }

    // If using local schemas (tag not found but version matches), skip sync
    if (usingLocalSchemas) {
      console.log(`Using existing local schemas for version ${tag.replace(/^v/, '')}`);
      return;
    }

    console.log(
      usingLocalSpec
        ? `Syncing Soustack spec from local path ${sourceDir}`
        : `Syncing Soustack spec from ${SPEC_REPO} @ ${tag}`
    );

    if (usingLocalSpec && !fs.existsSync(sourceDir)) {
      throw new Error(`Local spec path does not exist: ${sourceDir}`);
    }
  }

  const tempDir = sourceDir;
  if (!usingNpmSpec) {
    sourceCommit = getSourceCommit(tempDir);
    version = readSpecVersion(tempDir);
  }
  try {
    const previousMeta = readSyncMetadata();
    copyIntoSpecDirectory(tempDir);
    writeSpecVersion(version);
    updateSpecVersionModule(version);
    copySchemaIntoSrc();
    updatePackageJson(pkg, version, tag);

    // Discover required files from the synced spec directory
    const requiredFiles = getRequiredSpecFiles(SPEC_DIR);
    writeSyncMetadata({
      repo: usingNpmSpec ? null : SPEC_REPO,
      ref: usingNpmSpec ? version : tag,
      version,
      commit: usingNpmSpec ? null : sourceCommit,
      files: requiredFiles,
      source: usingNpmSpec ? 'npm' : undefined,
      previousMeta,
    });

    console.log(`Soustack spec synced successfully (version ${version}).`);
  } finally {
    const shouldCleanup = (!usingLocalSpec && !usingNpmSpec) || tempLocalCopy;
    if (shouldCleanup) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
