#!/usr/bin/env node
/**
 * Cleanup script to remove leftover collision artifacts from spec directory
 * These artifacts are created when npm pack/publish operations conflict with file operations
 * Pattern: files/directories with names ending in " 2", " 3", etc. (e.g., "fixtures 2/", ".sync-meta 2.json")
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SPEC_DIR = path.join(ROOT_DIR, 'spec');

/**
 * Check if a name matches the collision pattern (ends with space + number)
 * Examples: "fixtures 2", ".sync-meta 2.json", "soustack.schema 2.json"
 */
function isCollisionArtifact(name) {
  // Pattern: ends with space followed by one or more digits, optionally with extension
  const collisionPattern = /^.+ \d+(?:\.[^.]+)?$/;
  return collisionPattern.test(name);
}

function findCollisionArtifacts(dir, basePath = '', depth = 0) {
  const artifacts = [];
  if (!fs.existsSync(dir)) {
    return artifacts;
  }

  // Limit recursion depth to avoid scanning too deep
  if (depth > 10) {
    return artifacts;
  }

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = basePath ? path.join(basePath, entry.name) : entry.name;
      
      // Check if this is a collision artifact
      if (isCollisionArtifact(entry.name)) {
        artifacts.push({ fullPath, relativePath, isDirectory: entry.isDirectory() });
      }
      
      // Recursively check subdirectories
      if (entry.isDirectory()) {
        artifacts.push(...findCollisionArtifacts(fullPath, relativePath, depth + 1));
      }
    }
  } catch (error) {
    // Ignore permission errors
    if (error.code !== 'EACCES') {
      console.warn(`Warning: Could not read ${dir}: ${error.message}`);
    }
  }

  return artifacts;
}

function main() {
  console.log('Scanning spec directory for collision artifacts...');
  
  const artifacts = findCollisionArtifacts(SPEC_DIR, 'spec');
  
  if (artifacts.length === 0) {
    console.log('✓ No collision artifacts found. spec directory is clean.');
    return;
  }

  console.log(`Found ${artifacts.length} collision artifact(s):`);
  artifacts.forEach(({ relativePath, isDirectory }) => {
    const type = isDirectory ? 'directory' : 'file';
    console.log(`  - ${relativePath} (${type})`);
  });

  console.log('\nRemoving collision artifacts...');
  let removed = 0;
  let errors = 0;

  artifacts.forEach(({ fullPath, relativePath, isDirectory }) => {
    try {
      if (isDirectory) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }
      console.log(`  ✓ Removed ${relativePath}`);
      removed++;
    } catch (error) {
      console.error(`  ✗ Failed to remove ${relativePath}: ${error.message}`);
      errors++;
    }
  });

  console.log(`\n✓ Cleanup complete: ${removed} removed, ${errors} errors`);
  
  if (errors > 0) {
    process.exit(1);
  }
}

main();

