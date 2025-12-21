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
const NPM_SPEC_PATH = path.join(ROOT_DIR, 'node_modules', 'soustack-spec');

const LOCAL_SPEC_PATH = process.env.SOUSTACK_SPEC_PATH;
const SYNC_META_PATH = path.join(SPEC_DIR, '.sync-meta.json');

function readNpmSpecVersion(sourceDir) {
  const packageJsonPath = path.join(sourceDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`soustack-spec package.json not found at ${packageJsonPath}`);
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (!pkg.version) {
    throw new Error('soustack-spec package.json missing version');
  }

  return pkg.version;
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

function writeSyncMetadata({
  sourceType,
  ref,
  version,
  commit,
  sourcePath,
  specVersion,
  files,
}) {
  ensureSpecFilesExist(files);
  const checksums = files.reduce((acc, relativePath) => {
    const absolutePath = path.join(SPEC_DIR, relativePath);
    acc[relativePath] = createSha256(absolutePath);
    return acc;
  }, {});

  const payload = {
    sourceType,
    specVersion,
    syncedAt: new Date().toISOString(),
    files,
    checksums,
  };

  if (sourceType === 'npm') {
    payload.version = version;
  }

  if (sourceType === 'git') {
    payload.sourceRepo = SPEC_REPO;
    payload.ref = ref;
    payload.commit = commit;
  }

  if (sourceType === 'path') {
    payload.path = sourcePath;
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
  const cliRef = process.argv[2];
  const envRef = process.env.SOUSTACK_SPEC_TAG;
  const explicitRef = cliRef || envRef;
  const usingLocalSpec = Boolean(LOCAL_SPEC_PATH);
  let sourceType;
  let sourceDir;
  let sourceMeta = {};
  let tempLocalCopy;

  if (usingLocalSpec) {
    sourceType = 'path';
    const resolvedPath = path.resolve(ROOT_DIR, LOCAL_SPEC_PATH);
    sourceDir = resolvedPath;
    sourceMeta.sourcePath = resolvedPath;
  } else if (fs.existsSync(NPM_SPEC_PATH)) {
    sourceType = 'npm';
    sourceDir = NPM_SPEC_PATH;
    sourceMeta.version = readNpmSpecVersion(sourceDir);
  } else if (explicitRef) {
    sourceType = 'git';
    sourceDir = cloneSpecRepository(explicitRef);
    sourceMeta.ref = explicitRef;
    sourceMeta.commit = getSourceCommit(sourceDir);
  } else {
    throw new Error(
      'Unable to locate soustack-spec. Install node_modules/soustack-spec or provide SOUSTACK_SPEC_PATH or SOUSTACK_SPEC_TAG/CLI argument.'
    );
  }

  if (sourceType === 'path') {
    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Local spec path does not exist: ${sourceDir}`);
    }

    if (sourceDir === SPEC_DIR) {
      tempLocalCopy = fs.mkdtempSync(path.join(os.tmpdir(), 'soustack-spec-local-'));
      fs.cpSync(sourceDir, tempLocalCopy, { recursive: true });
      sourceDir = tempLocalCopy;
    }
  }

  let sourceMessage = 'Syncing Soustack spec';
  if (sourceType === 'path') {
    sourceMessage = `Syncing Soustack spec from local path ${sourceMeta.sourcePath}`;
  } else if (sourceType === 'npm') {
    sourceMessage = `Syncing Soustack spec from node_modules/soustack-spec (version ${sourceMeta.version})`;
  } else if (sourceType === 'git') {
    sourceMessage = `Syncing Soustack spec from ${SPEC_REPO} @ ${sourceMeta.ref}`;
  }

  console.log(sourceMessage);

  if (sourceType === 'git' && !sourceMeta.commit) {
    sourceMeta.commit = getSourceCommit(sourceDir);
  }

  const tempDir = sourceDir;
  try {
    const specVersion = readSpecVersion(tempDir);
    copyIntoSpecDirectory(tempDir);
    writeSpecVersion(specVersion);
    updateSpecVersionModule(specVersion);
    copySchemaIntoSrc();
    
    // Discover required files from the synced spec directory
    const requiredFiles = getRequiredSpecFiles(SPEC_DIR);
    writeSyncMetadata({
      sourceType,
      ref: sourceMeta.ref,
      version: sourceMeta.version,
      commit: sourceMeta.commit,
      sourcePath: sourceMeta.sourcePath,
      specVersion,
      files: requiredFiles,
    });

    console.log(`Soustack spec synced successfully (version ${specVersion}).`);
  } finally {
    if (sourceType === 'git' || tempLocalCopy) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
