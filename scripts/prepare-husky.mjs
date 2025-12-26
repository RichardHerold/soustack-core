#!/usr/bin/env node
/**
 * Guarded husky prepare script
 * Only runs husky if .git directory exists (i.e., in a git repository)
 * This prevents husky from running during npm pack/publish operations
 */

import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const GIT_DIR = path.join(ROOT_DIR, '.git');

if (fs.existsSync(GIT_DIR)) {
  // Run husky only if .git exists
  const husky = spawn('npx', ['husky'], {
    stdio: 'inherit',
    shell: true,
    cwd: ROOT_DIR,
  });
  
  husky.on('error', (error) => {
    console.error('Error running husky:', error.message);
    process.exit(1);
  });
  
  husky.on('exit', (code) => {
    process.exit(code || 0);
  });
} else {
  // Silently skip if not in a git repository
  process.exit(0);
}

