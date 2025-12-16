import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SPEC_REPO, REQUIRED_SPEC_FILES } from './schema-artifacts.mjs';

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
      // Use 'pipe' to suppress error output - we'll handle it gracefully
      execSync(`git clone --depth 1 --branch ${ref} ${SPEC_REPO} ${tempDir}`, { stdio: 'pipe' });
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

  const entries = [
    'soustack.schema.json',
    'profiles',
    'fixtures',
    'examples',
  ];

  entries.forEach((entry) => {
    const from = path.join(sourceDir, entry);
    const to = path.join(SPEC_DIR, entry);
    if (fs.existsSync(from)) {
      fs.cpSync(from, to, { recursive: true });
    }
  });
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

function writeSyncMetadata({ repo, ref, version, commit, files }) {
  ensureSpecFilesExist(files);
  const checksums = files.reduce((acc, relativePath) => {
    const absolutePath = path.join(SPEC_DIR, relativePath);
    acc[relativePath] = createSha256(absolutePath);
    return acc;
  }, {});

  const payload = {
    sourceRepo: repo,
    ref,
    specVersion: version,
    syncedAt: new Date().toISOString(),
    files,
    checksums,
  };

  if (commit) {
    payload.commit = commit;
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
  const tag = determineSpecTag(pkg);
  const usingLocalSpec = Boolean(LOCAL_SPEC_PATH);
  let sourceDir;
  let tempLocalCopy;
  let usingLocalSchemas = false;

  if (usingLocalSpec) {
    sourceDir = path.resolve(ROOT_DIR, LOCAL_SPEC_PATH);
  } else {
    try {
      sourceDir = cloneSpecRepository(tag);
    } catch (cloneError) {
      // If clone fails, check if we have local schemas that match the version
      const specVersionFile = path.join(SPEC_DIR, 'SOUSTACK_SPEC_VERSION');
      if (fs.existsSync(specVersionFile)) {
        const currentVersion = fs.readFileSync(specVersionFile, 'utf8').trim();
        const expectedVersion = tag.replace(/^v/, ''); // Remove 'v' prefix if present
        if (currentVersion === expectedVersion) {
          sourceDir = SPEC_DIR;
          usingLocalSchemas = true;
        } else {
          throw cloneError;
        }
      } else {
        throw cloneError;
      }
    }
  }

  if (usingLocalSpec && sourceDir === SPEC_DIR) {
    tempLocalCopy = fs.mkdtempSync(path.join(os.tmpdir(), 'soustack-spec-local-'));
    fs.cpSync(sourceDir, tempLocalCopy, { recursive: true });
    sourceDir = tempLocalCopy;
  }

  // If using local schemas (tag not found but version matches), still copy schemas to src/
  if (usingLocalSchemas) {
    console.warn(`Warning: Tag ${tag} not found in upstream, but local schemas match version ${tag.replace(/^v/, '')}. Using local schemas.`);
    // Still copy schema files to src/ to keep them in sync
    copySchemaIntoSrc();
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

  const tempDir = sourceDir;
  const sourceCommit = getSourceCommit(tempDir);
  try {
    const version = readSpecVersion(tempDir);
    copyIntoSpecDirectory(tempDir);
    writeSpecVersion(version);
    updateSpecVersionModule(version);
    copySchemaIntoSrc();
    updatePackageJson(pkg, version, tag);
    writeSyncMetadata({
      repo: SPEC_REPO,
      ref: tag,
      version,
      commit: sourceCommit,
      files: REQUIRED_SPEC_FILES,
    });

    console.log(`Soustack spec synced successfully (version ${version}).`);
  } finally {
    if (!usingLocalSpec || tempLocalCopy) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
