import schema from '../src/schema.json';
import pkg from '../package.json';

describe('Soustack schema version', () => {
  it('matches the declared supported spec version', () => {
    const supportedVersion = pkg.soustackSpecVersion;
    expect(typeof supportedVersion).toBe('string');
    const schemaId = (schema as any).$id as string | undefined;
    expect(schemaId).toBeDefined();

    const versionMatch = schemaId?.match(/\/schema\/v(\d+\.\d+(?:\.\d+)?)/);
    expect(versionMatch?.[1]).toBe(supportedVersion);
  });
});
