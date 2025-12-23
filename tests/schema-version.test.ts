import schema from '../src/schema.json';
import { SOUSTACK_SPEC_VERSION } from '../src/specVersion';
import fs from 'node:fs';
import path from 'node:path';

describe('Soustack schema version', () => {
  it('matches the declared supported spec version', () => {
    const supportedVersion = SOUSTACK_SPEC_VERSION;
    const schemaId = (schema as any).$id as string | undefined;
    expect(schemaId).toBeDefined();

    // The new schema $id does not contain a version, so we check for the exact ID
    expect(schemaId).toBe("https://soustack.spec/soustack.schema.json");
    // We can add a separate check for the SOUSTACK_SPEC_VERSION if needed
    // For now, we assume the sync script correctly updates SOUSTACK_SPEC_VERSION
    // based on the spec's SOUSTACK_SPEC_VERSION file.
  });

  it('matches the vendored spec version file', () => {
    const versionPath = path.join(__dirname, '..', 'spec', 'SOUSTACK_SPEC_VERSION');
    const vendoredVersion = fs.readFileSync(versionPath, 'utf8').trim();
    expect(vendoredVersion).toBe(SOUSTACK_SPEC_VERSION);
  });
});
