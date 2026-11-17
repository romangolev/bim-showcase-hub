import { describe, expect, it } from 'vitest';
import { globalIdFor, hashGlobalId, ifcGuidFromBytes } from './globalId.js';

const ALPHABET = /^[0-9A-Za-z_$]{22}$/;

describe('ifcGuidFromBytes', () => {
  it('encodes zero bytes as 22 zeros', () => {
    expect(ifcGuidFromBytes(new Uint8Array(16))).toBe('0'.repeat(22));
  });

  it('encodes all ones as 3 followed by 21 dollar signs', () => {
    expect(ifcGuidFromBytes(new Uint8Array(16).fill(255))).toBe(
      `3${'$'.repeat(21)}`,
    );
  });

  it('puts the lowest six bits in the last character', () => {
    const bytes = new Uint8Array(16);
    bytes[15] = 1;
    expect(ifcGuidFromBytes(bytes)).toBe(`${'0'.repeat(21)}1`);
  });
});

describe('hashGlobalId', () => {
  it('is stable, 22 characters and different per seed', () => {
    expect(hashGlobalId('a')).toBe(hashGlobalId('a'));
    expect(hashGlobalId('a')).not.toBe(hashGlobalId('b'));
    expect(hashGlobalId('a')).toMatch(ALPHABET);
  });
});

describe('globalIdFor', () => {
  const guid = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

  it('compresses a plain GUID external id', () => {
    expect(globalIdFor({ externalId: guid, urn: 'u', dbId: 1 })).toBe(
      `3${'$'.repeat(21)}`,
    );
  });

  it('mixes the Revit element id suffix into the last four bytes', () => {
    const plain = globalIdFor({ externalId: guid, urn: 'u', dbId: 1 });
    const suffixed = globalIdFor({
      externalId: `${guid}-000000ff`,
      urn: 'u',
      dbId: 1,
    });
    expect(suffixed).not.toBe(plain);
    expect(suffixed.endsWith('0')).toBe(true);
    expect(suffixed).toMatch(ALPHABET);
  });

  it('hashes the urn and external id when the external id is not a GUID', () => {
    const one = globalIdFor({ externalId: 'wall/12', urn: 'u1', dbId: 7 });
    expect(one).toMatch(ALPHABET);
    expect(one).toBe(
      globalIdFor({ externalId: 'wall/12', urn: 'u1', dbId: 7 }),
    );
    expect(one).not.toBe(
      globalIdFor({ externalId: 'wall/12', urn: 'u2', dbId: 7 }),
    );
  });

  it('falls back to the urn and dbId without an external id', () => {
    const a = globalIdFor({ urn: 'u', dbId: 1 });
    expect(a).not.toBe(globalIdFor({ urn: 'u', dbId: 2 }));
    expect(a).toBe(globalIdFor({ urn: 'u', dbId: 1 }));
  });
});
