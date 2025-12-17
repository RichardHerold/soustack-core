import fs from 'fs';
import path from 'path';

describe('Legacy guardrails', () => {
  const srcDir = path.join(__dirname, '..', 'src');

  it('should fail if src/modules directory exists', () => {
    const modulesDir = path.join(srcDir, 'modules');
    if (fs.existsSync(modulesDir)) {
      throw new Error(
        `Legacy src/modules directory should not exist. ` +
        `This directory was removed in v0.3.0. All module schemas should be in src/schemas/recipe/modules/`
      );
    }
  });

  it('should fail if legacy module schema files exist', () => {
    const legacyModuleFiles = [
      'src/modules/attribution/1.schema.json',
      'src/modules/media/1.schema.json',
      'src/modules/nutrition/1.schema.json',
      'src/modules/schedule/1.schema.json',
      'src/modules/taxonomy/1.schema.json',
      'src/modules/times/1.schema.json',
    ];

    const found = legacyModuleFiles.filter(file => {
      const fullPath = path.join(__dirname, '..', file);
      return fs.existsSync(fullPath);
    });

    if (found.length > 0) {
      throw new Error(
        `Found legacy module schema files that should not exist:\n${found.join('\n')}\n` +
        `These were removed in v0.3.0. Use src/schemas/recipe/modules/ instead.`
      );
    }
  });

  it('should fail if package.json includes src/modules in files array', () => {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    if (packageJson.files && packageJson.files.includes('src/modules')) {
      throw new Error(
        `package.json should not include 'src/modules' in files array. ` +
        `This was removed in v0.3.0.`
      );
    }
  });

  it('should fail if code imports from legacy modules path', () => {
    const srcFiles = getAllTypeScriptFiles(srcDir);
    const legacyImportPatterns = [
      /from\s+['"]\.\/modules\//,
      /from\s+['"]\.\.\/modules\//,
      /require\s*\(\s*['"]\.\/modules\//,
      /require\s*\(\s*['"]\.\.\/modules\//,
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
        `Found imports from legacy modules path:\n${violationList}\n` +
        `Use src/schemas/recipe/modules/ instead.`
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
      
      // Skip node_modules, dist, and test directories
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'tests') {
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

