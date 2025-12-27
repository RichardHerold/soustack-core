#!/usr/bin/env node
/**
 * Assert script to verify that required spec artifacts are present
 * This ensures tests can run successfully during npm publish
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SPEC_DIR = path.join(ROOT_DIR, 'spec');

const REQUIRED_FILES = [
  'soustack.schema.json',
];

const REQUIRED_DIRECTORIES = [
  'fixtures',
  'defs',
  'stacks',
];

const REQUIRED_FIXTURE_PATHS = [
  'fixtures/valid',
  'fixtures/invalid',
];

function checkFile(relativePath) {
  const absolutePath = path.join(SPEC_DIR, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing required spec file: spec/${relativePath}`);
  }
  
  if (!fs.statSync(absolutePath).isFile()) {
    throw new Error(`spec/${relativePath} exists but is not a file`);
  }
}

function checkDirectory(relativePath) {
  const absolutePath = path.join(SPEC_DIR, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing required spec directory: spec/${relativePath}`);
  }
  
  if (!fs.statSync(absolutePath).isDirectory()) {
    throw new Error(`spec/${relativePath} exists but is not a directory`);
  }
  
  // Check if directory is empty
  try {
    const entries = fs.readdirSync(absolutePath);
    if (entries.length === 0) {
      throw new Error(`spec/${relativePath} exists but is empty`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

function main() {
  // Check if spec directory exists
  if (!fs.existsSync(SPEC_DIR)) {
    throw new Error(
      'spec directory is missing. Run "npm run sync:spec" to sync spec artifacts before publishing.'
    );
  }

  if (!fs.statSync(SPEC_DIR).isDirectory()) {
    throw new Error('spec exists but is not a directory');
  }

  // Check required files
  for (const relativePath of REQUIRED_FILES) {
    checkFile(relativePath);
  }

  // Check required directories
  for (const relativePath of REQUIRED_DIRECTORIES) {
    checkDirectory(relativePath);
  }

  // Check required fixture subdirectories
  for (const relativePath of REQUIRED_FIXTURE_PATHS) {
    checkDirectory(relativePath);
  }

  // Check that fixtures directory has at least some files
  const fixturesValidPath = path.join(SPEC_DIR, 'fixtures', 'valid');
  const fixturesInvalidPath = path.join(SPEC_DIR, 'fixtures', 'invalid');
  
  if (fs.existsSync(fixturesValidPath)) {
    const validFiles = fs.readdirSync(fixturesValidPath, { recursive: true })
      .filter(entry => {
        const fullPath = path.join(fixturesValidPath, entry);
        return fs.statSync(fullPath).isFile() && entry.endsWith('.json');
      });
    
    if (validFiles.length === 0) {
      throw new Error('spec/fixtures/valid exists but contains no JSON files');
    }
  }

  if (fs.existsSync(fixturesInvalidPath)) {
    const invalidFiles = fs.readdirSync(fixturesInvalidPath, { recursive: true })
      .filter(entry => {
        const fullPath = path.join(fixturesInvalidPath, entry);
        return fs.statSync(fullPath).isFile() && entry.endsWith('.json');
      });
    
    if (invalidFiles.length === 0) {
      throw new Error('spec/fixtures/invalid exists but contains no JSON files');
    }
  }

  console.log('✓ All required spec artifacts are present');
}

main();

