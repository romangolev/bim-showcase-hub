import { describe, expect, it } from 'vitest';
import { regionOf } from '../../shared/region.js';
import { decodeBase64Url } from '../../shared/urn.js';
import { decodeUrn } from './modelContext.js';

const encode = (text: string) =>
  btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('decodeBase64Url', () => {
  it('decodes unpadded base64url and rejects invalid input', () => {
    expect(decodeBase64Url(encode('urn:adsk.wipprod:fs.file:vf.a?b'))).toBe(
      'urn:adsk.wipprod:fs.file:vf.a?b',
    );
    expect(decodeBase64Url('not base64 !')).toBeNull();
  });

  it('serves the region check for any text and the model name only for Autodesk urns', () => {
    const plain = encode('somewhere in emea');
    expect(decodeBase64Url(plain)).toBe('somewhere in emea');
    expect(regionOf(plain)).toEqual({ region: 'EU', certain: true });
    expect(decodeUrn(plain)).toBeNull();
    const adsk = encode('urn:adsk.wipemea:fs.file:vf.x?version=2');
    expect(regionOf(adsk)).toEqual({ region: 'EU', certain: true });
    expect(decodeUrn(adsk)).toBe('urn:adsk.wipemea:fs.file:vf.x?version=2');
  });
});
