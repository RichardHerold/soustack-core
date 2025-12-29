import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const STACKS_DIR = path.join(ROOT_DIR, 'src', 'stacks');

function main() {
  if (!fs.existsSync(STACKS_DIR)) {
    console.log('✅ Stacks directory does not exist, skipping check.');
    return;
  }

  // Find files matching * [0-9].json or * [0-9].md
  const patterns = [
    path.join(STACKS_DIR, '**', '* [0-9].json'),
    path.join(STACKS_DIR, '**', '* [0-9].md'),
  ];

  const foundFiles = [];
  for (const pattern of patterns) {
    const files = globSync(pattern, {
      cwd: ROOT_DIR,
      absolute: true,
      nodir: true,
    });
    foundFiles.push(...files);
  }

  if (foundFiles.length > 0) {
    console.error('❌ Found files with spaces and numbers in stacks directory:');
    console.error('');
    for (const file of foundFiles) {
      const relative = path.relative(ROOT_DIR, file);
      console.error(`  ${relative}`);
    }
    console.error('');
    console.error('Files in src/stacks must not contain spaces followed by numbers.');
    console.error('Example of invalid pattern: "stack 1.json" or "stack 2.md"');
    console.error('Use versioned naming like "stack@1.json" or "stack@1.md" instead.');
    process.exit(1);
  }

  console.log('✅ No files with spaces and numbers found in stacks directory.');
}

main();

