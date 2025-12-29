import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Legacy URLs that should not appear in source code, fixtures, or docs
const FORBIDDEN_LEGACY_URLS = [
  'https://soustack.spec/',
  'https://soustack.ai/schemas/',
];

// Directories to check (excluding vendored schemas and test fixtures)
const CHECK_DIRS = [
  'src',
  'docs',
];

// Directories/files to exclude (vendored schemas come from soustack-spec, fixtures test legacy acceptance)
const EXCLUDE_PATTERNS = [
  '**/spec/**',
  '**/tests/fixtures/**',
  '**/defs/**',
  '**/stacks/**',
  '**/profiles/**',
  '**/schemas/**',
  '**/soustack.schema.json',
  '**/schema.json',
];

// File patterns to check
const FILE_PATTERNS = [
  '**/*.ts',
  '**/*.js',
  '**/*.mjs',
  '**/*.json',
  '**/*.md',
];

// Exceptions: files that are allowed to contain legacy URLs (e.g., legacy documentation)
const EXCEPTION_PATTERNS = [
  // Add patterns here if needed, e.g.:
  // '**/legacy-*.md',
];

function relativeToRoot(filePath) {
  return path.relative(ROOT_DIR, filePath);
}

function isException(filePath) {
  const relative = relativeToRoot(filePath);
  
  // schemaMetadata.ts is the mapping module - it's allowed to reference legacy URLs
  if (relative === 'src/schemaMetadata.ts') {
    return true;
  }
  
  // Check explicit exception patterns
  if (EXCEPTION_PATTERNS.some((pattern) => {
    const regex = new RegExp(
      '^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$'
    );
    return regex.test(relative);
  })) {
    return true;
  }
  
  // Exclude vendored schemas and test fixtures (they're not "emitted" by core)
  return EXCLUDE_PATTERNS.some((pattern) => {
    const regex = new RegExp(
      '^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$'
    );
    return regex.test(relative);
  });
}

function checkFile(filePath) {
  if (isException(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const issues = [];

  for (const forbiddenUrl of FORBIDDEN_LEGACY_URLS) {
    // Check for the URL, but allow it in comments or as part of legacy mapping logic
    // We want to catch cases where legacy URLs are being emitted in generated output
    const regex = new RegExp(forbiddenUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    let match;
    while ((match = regex.exec(content)) !== null) {
      const index = match.index;
      const beforeMatch = content.substring(Math.max(0, index - 50), index);
      const afterMatch = content.substring(index, Math.min(content.length, index + 50));
      
      // Skip if it's in a comment
      const lineStart = content.lastIndexOf('\n', index) + 1;
      const lineContent = content.substring(lineStart, index + match[0].length);
      if (lineContent.trim().startsWith('//') || lineContent.includes('/*')) {
        continue;
      }
      
      // Skip if it's part of legacy mapping/acceptance logic (SCHEMA_ALIAS_MAP, LEGACY_SCHEMA_URLS, etc.)
      // Also skip if it's in a compatibility schema or internal ref resolution
      const fullContext = beforeMatch + afterMatch;
      const lineContentLower = lineContent.toLowerCase();
      if (fullContext.includes('LEGACY') || fullContext.includes('ALIAS') || 
          fullContext.includes('legacy') || fullContext.includes('Legacy') ||
          fullContext.includes('isLegacy') || fullContext.includes('normalizeSchemaUrl') ||
          fullContext.includes('resolveSchemaHint') || fullContext.includes('SCHEMA_ALIAS_MAP') ||
          fullContext.includes('LEGACY_SCHEMA_URLS') || fullContext.includes('compatibilitySchema') ||
          fullContext.includes('resolveStackSchemaRefs') || fullContext.includes('$ref') ||
          fullContext.includes('addSchema') || fullContext.includes('ajv') ||
          lineContentLower.includes('const legacy') || lineContentLower.includes('legacy_schema') ||
          lineContentLower.includes('startsWith("https://soustack') || 
          lineContentLower.includes('startsWith(\'https://soustack') ||
          lineContentLower.includes('refid') || lineContentLower.includes('ref id')) {
        continue;
      }
      
      // This is a potential emission of legacy URL
      const lines = content.substring(0, index).split('\n');
      const lineNumber = lines.length;
      const column = lines[lines.length - 1].length + 1;
      issues.push({
        file: relativeToRoot(filePath),
        line: lineNumber,
        column,
        url: forbiddenUrl,
        context: lineContent.trim().substring(0, 80),
      });
    }
  }

  return issues;
}

function main() {
  const allIssues = [];

  for (const dir of CHECK_DIRS) {
    const dirPath = path.join(ROOT_DIR, dir);
    if (!fs.existsSync(dirPath)) {
      continue;
    }

    for (const pattern of FILE_PATTERNS) {
      const searchPattern = path.join(dir, '**', pattern).replace(/\\/g, '/');
      const files = globSync(searchPattern, {
        cwd: ROOT_DIR,
        absolute: true,
        nodir: true,
        ignore: [
          '**/node_modules/**',
          '**/dist/**',
          '**/build/**',
          '**/.git/**',
        ],
      });

      for (const file of files) {
        try {
          const issues = checkFile(file);
          allIssues.push(...issues);
        } catch (error) {
          console.error(`Error checking ${relativeToRoot(file)}: ${error.message}`);
        }
      }
    }
  }

  if (allIssues.length > 0) {
    console.error('❌ Found potential legacy schema URL emissions in source code:');
    console.error('');
    for (const issue of allIssues) {
      console.error(`  ${issue.file}:${issue.line}:${issue.column} - Found "${issue.url}"`);
      if (issue.context) {
        console.error(`    Context: ${issue.context}`);
      }
    }
    console.error('');
    console.error('Legacy schema URLs must not be emitted in generated output.');
    console.error('Core accepts legacy URLs for validation/backward compatibility,');
    console.error('but always emits canonical URLs (https://spec.soustack.org) in generated output.');
    console.error('');
    console.error('Note: Legacy URLs in SCHEMA_ALIAS_MAP, isLegacySchemaUrl, normalizeSchemaUrl,');
    console.error('and similar mapping/acceptance functions are allowed.');
    process.exit(1);
  }

  console.log('✅ No legacy schema URLs found in source code, fixtures, or docs.');
}

main();

