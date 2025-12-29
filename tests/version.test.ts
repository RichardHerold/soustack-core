import fs from 'node:fs';
import path from 'node:path';
import { SOUSTACK_VERSION } from '../src';

describe('Soustack runtime version', () => {
  it('matches package.json version', () => {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    expect(SOUSTACK_VERSION).toBe(pkg.version);
  });
});
