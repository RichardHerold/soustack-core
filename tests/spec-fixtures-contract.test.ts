import { validateRecipe } from '../src/validator';
import path from 'path';
import fs from 'fs';
import { glob } from 'glob';

describe('Spec fixture contract tests', () => {
  const fixturesDir = path.join(__dirname, '..', 'spec', 'examples', 'fixtures');
  
  // Get all fixture files
  const fixtureFiles = glob.sync('*.json', { cwd: fixturesDir });
  
  if (fixtureFiles.length === 0) {
    it('should have fixture files', () => {
      throw new Error(`No fixture files found in ${fixturesDir}`);
    });
    return;
  }

  // Group fixtures by expected validity
  const validFixtures = fixtureFiles.filter(f => f.includes('.valid.json'));
  const invalidFixtures = fixtureFiles.filter(f => f.includes('.invalid.json'));

  describe('Valid fixtures', () => {
    validFixtures.forEach((fixtureFile) => {
      it(`should validate ${fixtureFile}`, () => {
        const fixturePath = path.join(fixturesDir, fixtureFile);
        const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
        
        const result = validateRecipe(fixture);
        
        if (!result.ok) {
          // Provide readable failure output
          const errorMessages = [
            ...result.schemaErrors.map((e) =>
              `  - ${e.path}: ${e.message}${e.keyword ? ` (${e.keyword})` : ''}`
            ),
            ...result.conformanceIssues.map((issue) =>
              `  - ${issue.path}: ${issue.message} (${issue.code})`
            ),
          ].join('\n');
          
          throw new Error(
            `Expected ${fixtureFile} to be valid, but validation failed:\n${errorMessages}`
          );
        }
        
        expect(result.ok).toBe(true);
        expect(result.schemaErrors).toHaveLength(0);
      });
    });
  });

  describe('Invalid fixtures', () => {
    invalidFixtures.forEach((fixtureFile) => {
      it(`should reject ${fixtureFile}`, () => {
        const fixturePath = path.join(fixturesDir, fixtureFile);
        const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
        
        const result = validateRecipe(fixture);
        
        if (result.ok) {
          throw new Error(
            `Expected ${fixtureFile} to be invalid, but validation passed. ` +
            `This fixture should demonstrate a validation error.`
          );
        }
        
        expect(result.ok).toBe(false);
        expect(result.schemaErrors.length + result.conformanceIssues.length).toBeGreaterThan(0);
      });
    });
  });

  it('should have at least one valid and one invalid fixture', () => {
    expect(validFixtures.length).toBeGreaterThan(0);
    expect(invalidFixtures.length).toBeGreaterThan(0);
  });
});
