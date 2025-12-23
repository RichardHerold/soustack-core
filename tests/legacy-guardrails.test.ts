import fs from 'fs';
import path from 'path';

describe('Legacy guardrails', () => {
  const srcDir = path.join(__dirname, '..', 'src');
  const legacySegment = ['mod', 'ules'].join('');
  const legacySchemaRoot = path.join('schemas', 'recipe', 'stacks');

  it('should fail if legacy directory exists', () => {
    const legacyDir = path.join(srcDir, legacySegment);
    if (fs.existsSync(legacyDir)) {
      throw new Error(
        `Legacy src/${legacySegment} directory should not exist. ` +
        `This directory was removed in v0.0.2. All stack schemas should be in src/${legacySchemaRoot}/`
      );
    }
  });

  it('should fail if legacy schema files exist', () => {
    const legacySchemaFiles = [
      path.join('src', legacySegment, 'attribution', '1.schema.json'),
      path.join('src', legacySegment, 'media', '1.schema.json'),
      path.join('src', legacySegment, 'nutrition', '1.schema.json'),
      path.join('src', legacySegment, 'schedule', '1.schema.json'),
      path.join('src', legacySegment, 'taxonomy', '1.schema.json'),
      path.join('src', legacySegment, 'times', '1.schema.json'),
    ];

    const found = legacySchemaFiles.filter(file => {
      const fullPath = path.join(__dirname, '..', file);
      return fs.existsSync(fullPath);
    });

    if (found.length > 0) {
      throw new Error(
        `Found legacy schema files that should not exist:\n${found.join('\n')}\n` +
        `These were removed in v0.0.2. Use src/${legacySchemaRoot}/ instead.`
      );
    }
  });

  it('should fail if package.json includes legacy path in files array', () => {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const legacyPath = path.join('src', legacySegment);

    if (packageJson.files && packageJson.files.includes(legacyPath)) {
      throw new Error(
        `package.json should not include '${legacyPath}' in files array. ` +
        `This was removed in v0.0.2.`
      );
    }
  });

  it('should fail if code imports from legacy path', () => {
    const srcFiles = getAllTypeScriptFiles(srcDir);
    const legacyImportPatterns = [
      new RegExp(`from\\s+['"]\\.\\/${legacySegment}\\/`),
      new RegExp(`from\\s+['"]\\.\\.\\/${legacySegment}\\/`),
      new RegExp(`require\\s*\\(\\s*['"]\\.\\/${legacySegment}\\/`),
      new RegExp(`require\\s*\\(\\s*['"]\\.\\.\\/${legacySegment}\\/`),
    ];

    const violations: Array<{ file: string; line: number; content: string }> = [];

    srcFiles.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        legacyImportPatterns.forEach(pattern => {
          if (pattern.test(line)) {
            violations.push({
              file: path.relative(path.join(__dirname, '..'), file),
              line: index + 1,
              content: line.trim(),
            });
          }
        });
      });
    });

    if (violations.length > 0) {
      const violationList = violations
        .map(v => `  ${v.file}:${v.line} - ${v.content}`)
        .join('\n');
      
      throw new Error(
        `Found imports from legacy path:\n${violationList}\n` +
        `Use src/${legacySchemaRoot}/ instead.`
      );
    }
  });
});

function getAllTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];
  
  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      // Skip dependency, dist, and test directories
      const dependencyDir = ['node', '_', 'mod', 'ules'].join('');
      if (entry.name === dependencyDir || entry.name === 'dist' || entry.name === 'tests') {
        continue;
      }
      
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        files.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return files;
}
