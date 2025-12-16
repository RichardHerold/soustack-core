import schema from '../src/schema.json';
import { SOUSTACK_SPEC_VERSION } from '../src/specVersion';

describe('Soustack schema version', () => {
  it('matches the declared supported spec version', () => {
    const supportedVersion = SOUSTACK_SPEC_VERSION;
    const schemaId = (schema as any).$id as string | undefined;
    expect(schemaId).toBeDefined();

    const versionMatch = schemaId?.match(/v(\d+\.\d+\.\d+)/);
    expect(versionMatch?.[1]).toBe(supportedVersion);
  });
});
