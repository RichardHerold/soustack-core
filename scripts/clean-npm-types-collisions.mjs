#!/usr/bin/env node
/**
 * Cleanup script to remove corrupted directories in node_modules/@types/
 * These directories are created when npm operations fail or are interrupted,
 * resulting in directories with names like "babel__core 2", "jest 2", etc.
 * TypeScript tries to use these as type libraries, causing TS2688 errors.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const TYPES_DIR = path.join(ROOT_DIR, 'node_modules', '@types');

/**
 * Check if a directory name matches the corrupted pattern (ends with space + number)
 * Examples: "babel__core 2", "jest 2", "yargs 2"
 */
function isCorruptedTypeDir(name) {
  // Pattern: ends with space followed by one or more digits
  const corruptedPattern = /^.+ \d+$/;
  return corruptedPattern.test(name);
}

function main() {
  if (!fs.existsSync(TYPES_DIR)) {
    // node_modules/@types doesn't exist, nothing to clean
    return;
  }

  const entries = fs.readdirSync(TYPES_DIR, { withFileTypes: true });
  const corruptedDirs = [];

  for (const entry of entries) {
    if (entry.isDirectory() && isCorruptedTypeDir(entry.name)) {
      const fullPath = path.join(TYPES_DIR, entry.name);
      corruptedDirs.push(fullPath);
    }
  }

  if (corruptedDirs.length === 0) {
    return;
  }

  // Remove corrupted directories
  for (const dir of corruptedDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      const relative = path.relative(ROOT_DIR, dir);
      console.log(`Removed corrupted type directory: ${relative}`);
    } catch (error) {
      console.error(`Failed to remove ${dir}:`, error.message);
    }
  }
}

main();

