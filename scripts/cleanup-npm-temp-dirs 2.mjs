#!/usr/bin/env node
/**
 * Cleanup script to remove leftover temporary directories from failed npm updates
 * This fixes ENOTEMPTY errors caused by npm's temporary rename operations
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const NODE_MODULES = path.join(ROOT_DIR, 'node_modules');

/**
 * Check if a directory name matches npm's temporary rename pattern
 * npm creates temp dirs like: .packageName-randomSuffix or .dirName-randomSuffix
 * Pattern: starts with dot, has alphanumeric characters, then a dash/underscore, then random suffix
 */
function isNpmTempDir(name) {
  // Skip known legitimate directories
  const legitimateDirs = ['.bin', '.cache', '.hooks'];
  if (legitimateDirs.includes(name)) {
    return false;
  }
  
  // npm temp dirs typically match: .name-randomSuffix or .name_randomSuffix
  // where randomSuffix is 6-10 alphanumeric characters
  const npmTempPattern = /^\.[a-zA-Z0-9_-]+-[A-Za-z0-9]{6,10}$/;
  return npmTempPattern.test(name);
}

function findTempDirs(dir, basePath = '', depth = 0) {
  const tempDirs = [];
  if (!fs.existsSync(dir)) {
    return tempDirs;
  }

  // Limit recursion depth to avoid scanning too deep
  if (depth > 5) {
    return tempDirs;
  }

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = basePath ? path.join(basePath, entry.name) : entry.name;
        
        // Check if this is a temp directory
        if (entry.name.startsWith('.') && isNpmTempDir(entry.name)) {
          tempDirs.push({ fullPath, relativePath });
        }
        
        // Recursively check subdirectories (skip node_modules/.bin and other known dirs)
        if (entry.name !== '.bin' && entry.name !== '.cache' && entry.name !== '.hooks') {
          tempDirs.push(...findTempDirs(fullPath, relativePath, depth + 1));
        }
      }
    }
  } catch (error) {
    // Ignore permission errors
    if (error.code !== 'EACCES') {
      console.warn(`Warning: Could not read ${dir}: ${error.message}`);
    }
  }

  return tempDirs;
}

function main() {
  console.log('Scanning for leftover npm temporary directories...');
  
  const tempDirs = findTempDirs(NODE_MODULES, 'node_modules');
  
  if (tempDirs.length === 0) {
    console.log('✓ No temporary directories found. node_modules is clean.');
    return;
  }

  console.log(`Found ${tempDirs.length} temporary directory(ies):`);
  tempDirs.forEach(({ relativePath }) => {
    console.log(`  - ${relativePath}`);
  });

  console.log('\nRemoving temporary directories...');
  let removed = 0;
  let errors = 0;

  tempDirs.forEach(({ fullPath, relativePath }) => {
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
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

