import { describe, expect, it } from 'vitest';
import { decodeUrn, describeModel } from './modelContext.js';

const URN =
  'dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLmFCY0RlRmdIaUprTG1ObzE_dmVyc2lvbj0y';

describe('describeModel', () => {
  it('decodes a base64 adsk urn', () => {
    expect(decodeUrn(URN)).toBe(
      'urn:adsk.wipprod:fs.file:vf.aBcDeFgHiJkLmNo1?version=2',
    );
    expect(decodeUrn('not base64 !')).toBeNull();
    expect(decodeUrn('aGVsbG8')).toBeNull();
  });

  it('prefers search context', () => {
    expect(describeModel(URN, 'Tower.rvt', 'v3')).toEqual({
      title: 'Tower.rvt',
      version: 'v3',
      hasFile: true,
    });
  });

  it('derives a version from the urn and falls back to an untitled model', () => {
    expect(describeModel(URN)).toEqual({
      title: 'Untitled model',
      version: 'v2',
      hasFile: false,
    });
    expect(describeModel('abc123')).toEqual({
      title: 'Untitled model',
      version: undefined,
      hasFile: false,
    });
  });
});
