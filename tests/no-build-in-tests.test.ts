import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

describe('guard: no build commands in tests', () => {
  it('should not contain npm run build or execSync/spawnSync build commands in test files', () => {
    const testDir = __dirname;
    const buildPatterns = [
      /npm\s+run\s+build/i,
      /execSync\s*\([^)]*build/i,
      /spawnSync\s*\([^)]*build/i,
      /exec\s*\([^)]*build/i,
      /spawn\s*\([^)]*build/i,
    ];

    function scanDirectory(dir: string): string[] {
      const files: string[] = [];
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...scanDirectory(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.test.ts') && entry.name !== 'no-build-in-tests.test.ts') {
          files.push(fullPath);
        }
      }

      return files;
    }

    const testFiles = scanDirectory(testDir);
    const violations: Array<{ file: string; line: number; content: string }> = [];

    for (const file of testFiles) {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const pattern of buildPatterns) {
          if (pattern.test(line)) {
            violations.push({
              file,
              line: i + 1,
              content: line.trim(),
            });
          }
        }
      }
    }

    if (violations.length > 0) {
      const violationMessages = violations.map(
        (v) => `  ${v.file}:${v.line} - ${v.content}`
      );
      throw new Error(
        `Found ${violations.length} build command violation(s) in test files:\n${violationMessages.join('\n')}`
      );
    }
  });
});

