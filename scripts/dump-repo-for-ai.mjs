#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Default ignore patterns
const DEFAULT_IGNORES = [
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'out',
  '.turbo',
  '.cache',
  'coverage',
  '.nyc_output',
  '.vscode',
  '.idea',
  '*.log',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.svg',
  '*.ico',
  '*.webp',
  '*.woff',
  '*.woff2',
  '*.ttf',
  '*.otf',
  '*.eot',
  '*.mp4',
  '*.mp3',
  '*.wav',
  '*.zip',
  '*.tar',
  '*.gz',
  '*.tgz',
  '*.rar',
  '*.7z',
];

// Binary file extensions
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp4', 'mp3', 'wav', 'avi', 'mov',
  'zip', 'tar', 'gz', 'tgz', 'rar', '7z', 'bz2',
  'pdf', 'doc', 'docx', 'xls', 'xlsx',
  'exe', 'dll', 'so', 'dylib',
]);

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    out: 'soustack-core-repo-pack.md',
    maxFileKB: 500,
    maxTotalMB: 50,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--out' && i + 1 < args.length) {
      config.out = args[++i];
    } else if (arg === '--maxFileKB' && i + 1 < args.length) {
      config.maxFileKB = parseInt(args[++i], 10);
    } else if (arg === '--maxTotalMB' && i + 1 < args.length) {
      config.maxTotalMB = parseInt(args[++i], 10);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node scripts/dump-repo-for-ai.mjs [options]

Options:
  --out <filename>        Output file path (default: soustack-core-repo-pack.md)
  --maxFileKB <number>     Maximum file size in KB (default: 500)
  --maxTotalMB <number>    Maximum total output size in MB (default: 50)
  --help, -h              Show this help message
`);
      process.exit(0);
    }
  }

  return config;
}

// Parse .gitignore-style patterns (simplified)
function parseIgnoreFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const patterns = [];
  
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    patterns.push(trimmed);
  }
  
  return patterns;
}

// Check if a path matches an ignore pattern (simplified matching)
function matchesPattern(relativePath, pattern) {
  // Normalize path separators
  const normalizedPath = relativePath.replace(/\\/g, '/');
  
  // Handle directory patterns (ending with /)
  if (pattern.endsWith('/')) {
    const dirPattern = pattern.slice(0, -1);
    return normalizedPath.startsWith(dirPattern + '/') || normalizedPath === dirPattern;
  }
  
  // Handle negation (!)
  if (pattern.startsWith('!')) {
    return false; // Simplified: we'll handle negation separately if needed
  }
  
  // Handle wildcards
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\//g, '\\/') + '$');
    return regex.test(normalizedPath);
  }
  
  // Exact match or prefix match
  return normalizedPath === pattern || normalizedPath.startsWith(pattern + '/');
}

// Check if a file should be ignored
function shouldIgnore(relativePath, ignorePatterns) {
  // Check default ignores
  for (const pattern of DEFAULT_IGNORES) {
    if (matchesPattern(relativePath, pattern)) {
      return true;
    }
  }
  
  // Check custom ignore patterns
  for (const pattern of ignorePatterns) {
    if (matchesPattern(relativePath, pattern)) {
      return true;
    }
  }
  
  // Check binary extensions
  const ext = path.extname(relativePath).slice(1).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) {
    return true;
  }
  
  return false;
}

// Check if a file is a text file (try to read as UTF-8)
function isTextFile(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    // Check for null bytes (common in binary files)
    if (buffer.includes(0)) {
      return false;
    }
    // Try to decode as UTF-8
    const text = buffer.toString('utf8');
    // Check if it's valid UTF-8 by re-encoding
    Buffer.from(text, 'utf8');
    return true;
  } catch {
    return false;
  }
}

// Get git metadata (best effort)
function getGitMetadata() {
  const metadata = {
    branch: null,
    sha: null,
    dirty: false,
  };

  try {
    // Check if we're in a git repo
    execSync('git rev-parse --git-dir', { cwd: ROOT_DIR, stdio: 'pipe' });
    
    // Get branch
    try {
      metadata.branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: ROOT_DIR,
        stdio: 'pipe',
        encoding: 'utf8',
      }).trim();
    } catch {
      // Detached HEAD or other state
    }
    
    // Get SHA
    try {
      metadata.sha = execSync('git rev-parse HEAD', {
        cwd: ROOT_DIR,
        stdio: 'pipe',
        encoding: 'utf8',
      }).trim();
    } catch {
      // No commits yet
    }
    
    // Check if dirty
    try {
      const status = execSync('git status --porcelain', {
        cwd: ROOT_DIR,
        stdio: 'pipe',
        encoding: 'utf8',
      });
      metadata.dirty = status.trim().length > 0;
    } catch {
      // Can't determine
    }
  } catch {
    // Not a git repo or git not available
  }

  return metadata;
}

// Walk directory tree deterministically (alphabetical, depth-first)
function walkDirectory(dir, relativePath = '', ignorePatterns = []) {
  const entries = [];
  
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    // Sort for deterministic ordering
    items.sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      if (nameA !== nameB) {
        return nameA < nameB ? -1 : 1;
      }
      return a.name < b.name ? -1 : 1;
    });
    
    for (const item of items) {
      const itemPath = path.join(dir, item.name);
      const itemRelativePath = relativePath ? `${relativePath}/${item.name}` : item.name;
      
      // Normalize path separators
      const normalizedPath = itemRelativePath.replace(/\\/g, '/');
      
      if (shouldIgnore(normalizedPath, ignorePatterns)) {
        continue;
      }
      
      if (item.isDirectory()) {
        entries.push(...walkDirectory(itemPath, normalizedPath, ignorePatterns));
      } else if (item.isFile()) {
        entries.push({
          absolutePath: itemPath,
          relativePath: normalizedPath,
        });
      }
    }
  } catch (error) {
    // Fail gracefully on read errors
    console.error(`Warning: Could not read directory ${dir}: ${error.message}`);
  }
  
  return entries;
}

// Calculate SHA256 hash
function calculateSHA256(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  } catch {
    return null;
  }
}

// Read file content safely
function readFileContent(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return `[Error reading file: ${error.message}]`;
  }
}

// Main function
async function main() {
  const config = parseArgs();
  const maxFileBytes = config.maxFileKB * 1024;
  const maxTotalBytes = config.maxTotalMB * 1024 * 1024;
  
  // Load ignore patterns
  const gitignorePatterns = parseIgnoreFile(path.join(ROOT_DIR, '.gitignore'));
  const repoPackIgnorePatterns = parseIgnoreFile(path.join(ROOT_DIR, '.repo-pack-ignore'));
  const allIgnorePatterns = [...gitignorePatterns, ...repoPackIgnorePatterns];
  
  // Get git metadata
  const gitMetadata = getGitMetadata();
  
  // Walk the directory tree
  console.log('Scanning repository...');
  const allFiles = walkDirectory(ROOT_DIR, '', allIgnorePatterns);
  
  // Filter and process files
  const includedFiles = [];
  const skippedFiles = [];
  let totalBytes = 0;
  const skipReasons = new Map();
  
  for (const file of allFiles) {
    const stats = fs.statSync(file.absolutePath);
    const fileSize = stats.size;
    
    // Check file size limit
    if (fileSize > maxFileBytes) {
      skippedFiles.push(file.relativePath);
      skipReasons.set(file.relativePath, `File too large (${Math.round(fileSize / 1024)}KB > ${config.maxFileKB}KB)`);
      continue;
    }
    
    // Check total size limit
    if (totalBytes + fileSize > maxTotalBytes) {
      skippedFiles.push(file.relativePath);
      skipReasons.set(file.relativePath, `Total size limit reached`);
      continue;
    }
    
    // Check if text file
    if (!isTextFile(file.absolutePath)) {
      skippedFiles.push(file.relativePath);
      skipReasons.set(file.relativePath, 'Binary file');
      continue;
    }
    
    // Include the file
    includedFiles.push({
      ...file,
      size: fileSize,
    });
    totalBytes += fileSize;
  }
  
  // Sort included files for deterministic output
  includedFiles.sort((a, b) => {
    const pathA = a.relativePath.toLowerCase();
    const pathB = b.relativePath.toLowerCase();
    if (pathA !== pathB) {
      return pathA < pathB ? -1 : 1;
    }
    return a.relativePath < b.relativePath ? -1 : 1;
  });
  
  // Generate markdown
  console.log(`Generating repo pack (${includedFiles.length} files)...`);
  
  const repoName = path.basename(ROOT_DIR);
  const timestamp = new Date().toISOString();
  
  let output = `# Repo Pack: ${repoName}\n`;
  output += `Generated: ${timestamp}\n`;
  
  if (gitMetadata.branch || gitMetadata.sha) {
    const gitInfo = [];
    if (gitMetadata.branch) gitInfo.push(`branch=${gitMetadata.branch}`);
    if (gitMetadata.sha) gitInfo.push(`sha=${gitMetadata.sha}`);
    gitInfo.push(`dirty=${gitMetadata.dirty}`);
    output += `Git: ${gitInfo.join(' ')}\n`;
  }
  
  output += `Limits: maxFileKB=${config.maxFileKB}, maxTotalMB=${config.maxTotalMB}\n\n`;
  
  // File tree
  output += `## File Tree (paths)\n`;
  output += `\`\`\`text\n`;
  for (const file of includedFiles) {
    output += `${file.relativePath}\n`;
  }
  output += `\`\`\`\n\n`;
  
  // Files (contents)
  output += `## Files (contents)\n\n`;
  
  for (const file of includedFiles) {
    const sha256 = calculateSHA256(file.absolutePath);
    const content = readFileContent(file.absolutePath);
    
    output += `FILE: ${file.relativePath}\n`;
    output += `\t•\tbytes: ${file.size}\n`;
    if (sha256) {
      output += `\t•\tsha256: ${sha256}\n`;
    }
    output += `\n`;
    output += `${content}\n`;
    output += `\n`;
  }
  
  // Summary
  output += `## Summary\n\n`;
  output += `Included files: ${includedFiles.length}\n`;
  output += `Skipped files: ${skippedFiles.length}\n`;
  output += `Total included bytes: ${totalBytes}\n\n`;
  
  // Skipped files (top reasons)
  if (skippedFiles.length > 0) {
    output += `### Skipped (top reasons)\n\n`;
    const reasonCounts = new Map();
    for (const file of skippedFiles.slice(0, 100)) { // Limit to first 100
      const reason = skipReasons.get(file) || 'Unknown';
      reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
    }
    
    // Sort by count
    const sortedReasons = Array.from(reasonCounts.entries()).sort((a, b) => b[1] - a[1]);
    for (const [reason, count] of sortedReasons) {
      output += `\t•\t${reason}: ${count} file(s)\n`;
    }
    
    if (skippedFiles.length > 100) {
      output += `\t•\t... and ${skippedFiles.length - 100} more\n`;
    }
  }
  
  // Write output
  const outputPath = path.isAbsolute(config.out) ? config.out : path.join(ROOT_DIR, config.out);
  fs.writeFileSync(outputPath, output, 'utf8');
  
  console.log(`✓ Repo pack written to: ${outputPath}`);
  console.log(`  Included: ${includedFiles.length} files (${Math.round(totalBytes / 1024)}KB)`);
  console.log(`  Skipped: ${skippedFiles.length} files`);
}

main().catch((error) => {
  console.error('Error:', error.message || error);
  process.exit(1);
});

