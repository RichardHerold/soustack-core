import schema from '../src/schema.json';
import { SOUSTACK_SPEC_VERSION } from '../src/specVersion';
import fs from 'node:fs';
import path from 'node:path';

describe('Soustack schema version', () => {
  it('matches the declared supported spec version', () => {
    const supportedVersion = SOUSTACK_SPEC_VERSION;
    const schemaId = (schema as any).$id as string | undefined;
    expect(schemaId).toBeDefined();

    const versionMatch = schemaId?.match(/v(\d+\.\d+\.\d+)/);
    expect(versionMatch?.[1]).toBe(supportedVersion);
  });

  it('matches the vendored spec version file', () => {
    const versionPath = path.join(__dirname, '..', 'spec', 'SOUSTACK_SPEC_VERSION');
    const vendoredVersion = fs.readFileSync(versionPath, 'utf8').trim();
    expect(vendoredVersion).toBe(SOUSTACK_SPEC_VERSION);
  });
});
