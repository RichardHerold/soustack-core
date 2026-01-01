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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '@soustack-spec-'));
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
  // #region agent log
  try {
    fetch('http://127.0.0.1:7255/ingest/4f34f152-5cff-4133-a069-6f90159cb43b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-spec.mjs:109',message:'Removing entire SPEC_DIR',data:{specDir:SPEC_DIR,exists:fs.existsSync(SPEC_DIR)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  } catch(e) {}
  // #endregion
  if (fs.existsSync(SPEC_DIR)) {
    fs.rmSync(SPEC_DIR, { recursive: true, force: true });
  }
  // #region agent log
  try {
    fetch('http://127.0.0.1:7255/ingest/4f34f152-5cff-4133-a069-6f90159cb43b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-spec.mjs:110',message:'Creating SPEC_DIR',data:{specDir:SPEC_DIR},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  } catch(e) {}
  // #endregion
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
  const defsDest = path.join(SPEC_DIR, 'defs');
  if (fs.existsSync(defsSource)) {
    // Always remove destination to prevent fs.cpSync from creating duplicates
    fs.rmSync(defsDest, { recursive: true, force: true });
    fs.cpSync(defsSource, defsDest, { recursive: true });
  }

  // Copy stacks directory (new structure)
  const stacksSource = path.join(sourceDir, 'stacks');
  const stacksDest = path.join(SPEC_DIR, 'stacks');
  if (fs.existsSync(stacksSource)) {
    // Always remove destination to prevent fs.cpSync from creating duplicates
    // #region agent log
    try {
      fetch('http://127.0.0.1:7255/ingest/4f34f152-5cff-4133-a069-6f90159cb43b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-spec.mjs:142',message:'Removing stacks dest before copy',data:{stacksDest,exists:fs.existsSync(stacksDest)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    } catch(e) {}
    // #endregion
    if (fs.existsSync(stacksDest)) {
      fs.rmSync(stacksDest, { recursive: true, force: true });
    }
    // #region agent log
    try {
      fetch('http://127.0.0.1:7255/ingest/4f34f152-5cff-4133-a069-6f90159cb43b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-spec.mjs:143',message:'Copying stacks directory',data:{stacksSource,stacksDest,sourceExists:fs.existsSync(stacksSource)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    } catch(e) {}
    // #endregion
    fs.cpSync(stacksSource, stacksDest, { recursive: true });
    // #region agent log
    try {
      fetch('http://127.0.0.1:7255/ingest/4f34f152-5cff-4133-a069-6f90159cb43b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-spec.mjs:144',message:'After cpSync stacks',data:{destExists:fs.existsSync(stacksDest),collisionExists:fs.existsSync(stacksDest + ' 2')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    } catch(e) {}
    // #endregion
  }

  // Copy schemas directory (may contain stacks-registry.schema.json)
  const schemasSource = path.join(sourceDir, 'schemas');
  const schemasDest = path.join(SPEC_DIR, 'schemas');
  if (fs.existsSync(schemasSource)) {
    // Always remove destination to prevent fs.cpSync from creating duplicates
    fs.rmSync(schemasDest, { recursive: true, force: true });
    fs.cpSync(schemasSource, schemasDest, { recursive: true });
  }

  // Copy fixtures directory
  const fixturesSource = path.join(sourceDir, 'fixtures');
  const fixturesDest = path.join(SPEC_DIR, 'fixtures');
  if (fs.existsSync(fixturesSource)) {
    // Always remove destination to prevent fs.cpSync from creating duplicates
    // #region agent log
    try {
      fetch('http://127.0.0.1:7255/ingest/4f34f152-5cff-4133-a069-6f90159cb43b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-spec.mjs:160',message:'Removing fixtures dest before copy',data:{fixturesDest,exists:fs.existsSync(fixturesDest)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    } catch(e) {}
    // #endregion
    if (fs.existsSync(fixturesDest)) {
      fs.rmSync(fixturesDest, { recursive: true, force: true });
    }
    // #region agent log
    try {
      fetch('http://127.0.0.1:7255/ingest/4f34f152-5cff-4133-a069-6f90159cb43b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-spec.mjs:161',message:'Copying fixtures directory',data:{fixturesSource,fixturesDest,sourceExists:fs.existsSync(fixturesSource)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    } catch(e) {}
    // #endregion
    fs.cpSync(fixturesSource, fixturesDest, { recursive: true });
    // #region agent log
    try {
      fetch('http://127.0.0.1:7255/ingest/4f34f152-5cff-4133-a069-6f90159cb43b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-spec.mjs:162',message:'After cpSync fixtures',data:{destExists:fs.existsSync(fixturesDest),collisionExists:fs.existsSync(fixturesDest + ' 2')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    } catch(e) {}
    // #endregion
  }

  // Copy examples directory (if present)
  const examplesSource = path.join(sourceDir, 'examples');
  const examplesDest = path.join(SPEC_DIR, 'examples');
  if (fs.existsSync(examplesSource)) {
    // Always remove destination to prevent fs.cpSync from creating duplicates
    fs.rmSync(examplesDest, { recursive: true, force: true });
    fs.cpSync(examplesSource, examplesDest, { recursive: true });
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
  const defsDest = path.join(srcDir, 'defs');
  if (fs.existsSync(defsSource)) {
    // Always remove destination to prevent fs.cpSync from creating duplicates
    fs.rmSync(defsDest, { recursive: true, force: true });
    fs.cpSync(defsSource, defsDest, { recursive: true });
  }

  // Copy stacks directory to src (new structure)
  const stacksSource = path.join(SPEC_DIR, 'stacks');
  const stacksDest = path.join(srcDir, 'stacks');
  if (fs.existsSync(stacksSource)) {
    // Always remove destination to prevent fs.cpSync from creating duplicates
    // #region agent log
    try {
      fetch('http://127.0.0.1:7255/ingest/4f34f152-5cff-4133-a069-6f90159cb43b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-spec.mjs:200',message:'Removing src/stacks dest before copy',data:{stacksDest,exists:fs.existsSync(stacksDest)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    } catch(e) {}
    // #endregion
    if (fs.existsSync(stacksDest)) {
      fs.rmSync(stacksDest, { recursive: true, force: true });
    }
    // #region agent log
    try {
      fetch('http://127.0.0.1:7255/ingest/4f34f152-5cff-4133-a069-6f90159cb43b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-spec.mjs:201',message:'Copying stacks to src',data:{stacksSource,stacksDest,sourceExists:fs.existsSync(stacksSource)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    } catch(e) {}
    // #endregion
    fs.cpSync(stacksSource, stacksDest, { recursive: true });
    // #region agent log
    try {
      fetch('http://127.0.0.1:7255/ingest/4f34f152-5cff-4133-a069-6f90159cb43b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-spec.mjs:202',message:'After cpSync src/stacks',data:{destExists:fs.existsSync(stacksDest),collisionExists:fs.existsSync(stacksDest + ' 2')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    } catch(e) {}
    // #endregion
  }

  // Copy schemas directory (may contain stacks-registry.schema.json or legacy recipe/registry)
  const schemasSource = path.join(SPEC_DIR, 'schemas');
  const schemasDest = path.join(srcDir, 'schemas');
  if (fs.existsSync(schemasSource)) {
    // Always remove destination to prevent fs.cpSync from creating duplicates
    fs.rmSync(schemasDest, { recursive: true, force: true });
    fs.cpSync(schemasSource, schemasDest, { recursive: true });
  }

  // Legacy: Copy profiles if they still exist (for backward compatibility during transition)
  const profilesSource = path.join(SPEC_DIR, 'profiles');
  const profilesDest = path.join(srcDir, 'profiles');
  if (fs.existsSync(profilesSource)) {
    // Always remove destination to prevent fs.cpSync from creating duplicates
    fs.rmSync(profilesDest, { recursive: true, force: true });
    fs.cpSync(profilesSource, profilesDest, { recursive: true });
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
    // Sort arrays to ensure consistent comparison
    return value.map(sortKeysDeep).sort();
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

  // Remove fields that don't affect the actual spec content
  // - syncedAt: timestamp, changes on every sync
  // - sourceRepo, commit, source: metadata about sync method, not spec content
  const { syncedAt: _aSyncedAt, sourceRepo: _aSourceRepo, commit: _aCommit, source: _aSource, ...aRest } = a;
  const { syncedAt: _bSyncedAt, sourceRepo: _bSourceRepo, commit: _bCommit, source: _bSource, ...bRest } = b;
  
  // Normalize ref by removing 'v' prefix for comparison (v0.0.2 === 0.0.2)
  const normalizeRef = (ref) => (typeof ref === 'string' ? ref.replace(/^v/, '') : ref);
  if (aRest.ref !== undefined && bRest.ref !== undefined) {
    aRest.ref = normalizeRef(aRest.ref);
    bRest.ref = normalizeRef(bRest.ref);
  }
  
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

  // Build payload without syncedAt first to check if content changed
  const payload = {
    ref,
    specVersion: version,
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

  // Check if content changed (ignoring volatile fields like syncedAt)
  const contentChanged = !previousMeta || !areSyncMetadataEqual(previousMeta, payload);

  // Only update syncedAt if content actually changed
  if (contentChanged) {
    payload.syncedAt = new Date().toISOString();
    fs.writeFileSync(SYNC_META_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  } else {
    // Content unchanged - restore the original file to preserve syncedAt and avoid unnecessary changes
    if (previousMeta) {
      // Restore the original file content (which includes the original syncedAt)
      const originalContent = JSON.stringify(previousMeta, null, 2);
      fs.writeFileSync(SYNC_META_PATH, `${originalContent}\n`);
    }
    return;
  }
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

/**
 * Ensure all version-related files are consistent with the given version
 */
function ensureVersionConsistency(version) {
  const versionFiles = [
    { path: path.join(ROOT_DIR, 'spec', 'SOUSTACK_SPEC_VERSION'), content: `${version}\n` },
    { path: path.join(ROOT_DIR, 'src', 'specVersion.ts'), content: `export const SOUSTACK_SPEC_VERSION = '${version}';\n` },
  ];
  
  let updated = false;
  versionFiles.forEach(({ path: filePath, content }) => {
    const currentContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    if (currentContent.trim() !== content.trim()) {
      fs.writeFileSync(filePath, content);
      updated = true;
      console.log(`Updated ${path.relative(ROOT_DIR, filePath)} to version ${version}`);
    }
  });
  
  return updated;
}

/**
 * Update registry.json files to match the given spec version
 */
function updateRegistryVersion(version) {
  const registryPaths = [
    path.join(SPEC_DIR, 'stacks', 'registry.json'),
    path.join(ROOT_DIR, 'src', 'stacks', 'registry.json'),
  ];
  
  let updated = false;
  registryPaths.forEach((registryPath) => {
    if (!fs.existsSync(registryPath)) {
      // Registry file may not exist, skip silently
      return;
    }
    
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    if (registry.spec?.currentSpecVersion !== version) {
      registry.spec = registry.spec || {};
      registry.spec.currentSpecVersion = version;
      fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
      updated = true;
      console.log(`Updated ${path.relative(ROOT_DIR, registryPath)}.spec.currentSpecVersion to ${version}`);
    }
  });
  
  return updated;
}

/**
 * Validate that all version files are synchronized
 */
function validateVersionSync() {
  const specVersionFile = path.join(SPEC_DIR, 'SOUSTACK_SPEC_VERSION');
  const srcVersionFile = path.join(ROOT_DIR, 'src', 'specVersion.ts');
  
  if (!fs.existsSync(specVersionFile)) {
    throw new Error('spec/SOUSTACK_SPEC_VERSION is missing');
  }
  if (!fs.existsSync(srcVersionFile)) {
    throw new Error('src/specVersion.ts is missing');
  }
  
  const specVersion = fs.readFileSync(specVersionFile, 'utf8').trim();
  const srcVersionMatch = fs.readFileSync(srcVersionFile, 'utf8').match(/SOUSTACK_SPEC_VERSION\s*=\s*['"]([^'"]+)['"]/);
  const srcVersion = srcVersionMatch ? srcVersionMatch[1] : null;
  
  if (!srcVersion) {
    throw new Error('Could not parse version from src/specVersion.ts');
  }
  
  const mismatches = [];
  if (specVersion !== srcVersion) {
    mismatches.push(`spec/SOUSTACK_SPEC_VERSION (${specVersion}) !== src/specVersion.ts (${srcVersion})`);
  }
  
  // Validate registry.json files
  const specRegistryPath = path.join(SPEC_DIR, 'stacks', 'registry.json');
  const srcRegistryPath = path.join(ROOT_DIR, 'src', 'stacks', 'registry.json');
  
  if (fs.existsSync(specRegistryPath)) {
    const specRegistry = JSON.parse(fs.readFileSync(specRegistryPath, 'utf8'));
    if (specRegistry.spec?.currentSpecVersion !== specVersion) {
      mismatches.push(
        `spec/stacks/registry.json.spec.currentSpecVersion (${specRegistry.spec?.currentSpecVersion}) !== spec/SOUSTACK_SPEC_VERSION (${specVersion}). ` +
        `spec/SOUSTACK_SPEC_VERSION is the source of truth.`
      );
    }
  }
  
  if (fs.existsSync(srcRegistryPath)) {
    const srcRegistry = JSON.parse(fs.readFileSync(srcRegistryPath, 'utf8'));
    if (srcRegistry.spec?.currentSpecVersion !== specVersion) {
      mismatches.push(
        `src/stacks/registry.json.spec.currentSpecVersion (${srcRegistry.spec?.currentSpecVersion}) !== spec/SOUSTACK_SPEC_VERSION (${specVersion}). ` +
        `spec/SOUSTACK_SPEC_VERSION is the source of truth.`
      );
    }
  }
  
  if (mismatches.length > 0) {
    throw new Error(`Version sync validation failed:\n${mismatches.join('\n')}`);
  }
  
  console.log(`✓ All version files are synchronized at ${specVersion}`);
}

async function main() {
  // Read previous metadata BEFORE removing spec directory
  // This allows us to compare new metadata with old metadata to avoid unnecessary writes
  const previousMeta = readSyncMetadata();
  
  // Ensure clean start: remove spec directory if it exists to prevent duplicate directories
  if (fs.existsSync(SPEC_DIR)) {
    fs.rmSync(SPEC_DIR, { recursive: true, force: true });
  }
  
  // Note: soustack-spec is the GitHub repository name, @soustack/spec is the npm package name
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
    sourceDir = path.join(ROOT_DIR, 'node_modules', '@soustack', 'spec');
    if (!fs.existsSync(sourceDir)) {
      throw new Error(
        'SOUSTACK_SPEC_SOURCE is set to "npm" but node_modules/@soustack/spec was not found. Run npm install.'
      );
    }
    // For npm source, prefer SOUSTACK_SPEC_VERSION file over package.json version
    const versionFile = path.join(sourceDir, 'SOUSTACK_SPEC_VERSION');
    if (fs.existsSync(versionFile)) {
      version = readSpecVersion(sourceDir);
    } else {
      // Fall back to package.json version if SOUSTACK_SPEC_VERSION doesn't exist
      const specPackagePath = path.join(sourceDir, 'package.json');
      if (!fs.existsSync(specPackagePath)) {
        throw new Error('@soustack/spec package.json not found in node_modules.');
      }
      const specPackage = JSON.parse(fs.readFileSync(specPackagePath, 'utf8'));
      if (!specPackage.version) {
        throw new Error('@soustack/spec package.json is missing a version field.');
      }
      version = specPackage.version;
    }
    tag = `v${version}`;
    console.log(`Syncing Soustack spec from npm package at ${sourceDir}`);
  } else {
    tag = determineSpecTag(pkg);
    sourceDir = usingLocalSpec
      ? path.resolve(ROOT_DIR, LOCAL_SPEC_PATH)
      : cloneSpecRepository(tag);
    const usingLocalSchemas = !usingLocalSpec && sourceDir === SPEC_DIR;

    if (usingLocalSpec && sourceDir === SPEC_DIR && !usingLocalSchemas) {
      tempLocalCopy = fs.mkdtempSync(path.join(os.tmpdir(), '@soustack-spec-local-'));
      fs.cpSync(sourceDir, tempLocalCopy, { recursive: true });
      sourceDir = tempLocalCopy;
    }

    if (usingLocalSchemas) {
      console.log(
        `Using existing local schemas for version ${tag.replace(/^v/, '')} (regenerating sync metadata from local copy)`
      );
      tempLocalCopy = fs.mkdtempSync(path.join(os.tmpdir(), '@soustack-spec-local-'));
      fs.cpSync(sourceDir, tempLocalCopy, { recursive: true });
      sourceDir = tempLocalCopy;
    }

    console.log(
      usingLocalSpec
        ? `Syncing Soustack spec from local path ${sourceDir}`
        : usingLocalSchemas
          ? `Syncing Soustack spec from existing local copy at ${SPEC_DIR}`
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
  
  // Allow version override via environment variable or package.json
  const versionOverride = process.env.SOUSTACK_SPEC_VERSION_OVERRIDE || pkg.soustackSpecVersion;
  if (versionOverride && versionOverride !== version) {
    console.log(`Version override: using ${versionOverride} instead of ${version} from source`);
    version = versionOverride;
  }
  
  try {
    const resolvedCommit = usingNpmSpec ? null : (sourceCommit || previousMeta?.commit || null);
    copyIntoSpecDirectory(tempDir);
    
    // Write version files and ensure consistency
    writeSpecVersion(version);
    updateSpecVersionModule(version);
    ensureVersionConsistency(version);
    
    copySchemaIntoSrc();
    
    // Update registry.json files to match SOUSTACK_SPEC_VERSION (source of truth)
    updateRegistryVersion(version);
    
    // Note: package.json is not modified to prevent version drift and CI failures.
    // soustackSpecVersion and soustackSpecTag should be manually maintained.

    // Discover required files from the synced spec directory
    const requiredFiles = getRequiredSpecFiles(SPEC_DIR);
    writeSyncMetadata({
      repo: usingNpmSpec ? null : SPEC_REPO,
      ref: usingNpmSpec ? version : tag,
      version,
      commit: resolvedCommit,
      files: requiredFiles,
      source: usingNpmSpec ? 'npm' : undefined,
      previousMeta,
    });

    // Validate that all version files are synchronized
    validateVersionSync();

    // Check for collision artifacts after sync
    // #region agent log
    try {
      const collisionCheck = [];
      const entries = fs.readdirSync(SPEC_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && /^.+ \d+$/.test(entry.name)) {
          collisionCheck.push(entry.name);
        }
      }
      fetch('http://127.0.0.1:7255/ingest/4f34f152-5cff-4133-a069-6f90159cb43b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-spec.mjs:525',message:'Post-sync collision check',data:{collisions:collisionCheck,specDir:SPEC_DIR},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    } catch(e) {}
    // #endregion

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
