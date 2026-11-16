import { describe, expect, it } from 'vitest';
import {
  decodeUrn,
  describeModel,
  parseModelContext,
  sameModelContext,
} from './modelContext.js';

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

describe('model context normalizer', () => {
  it('keeps only valid, non-empty fields from any value', () => {
    expect(
      parseModelContext({
        file: 'A.rvt',
        v: '',
        crumbs: ['Hub', 3],
        trail: [],
        extra: true,
      }),
    ).toEqual({ file: 'A.rvt' });
    expect(parseModelContext(null)).toEqual({});
    expect(parseModelContext('x')).toEqual({});
  });

  it('copies the lists it keeps', () => {
    const crumbs = ['Hub'];
    const parsed = parseModelContext({ crumbs });
    crumbs.push('Docs');
    expect(parsed.crumbs).toEqual(['Hub']);
  });

  it('compares contexts field by field, ignoring empty fields', () => {
    expect(
      sameModelContext({ v: 'v1', file: 'A.rvt' }, { file: 'A.rvt', v: 'v1' }),
    ).toBe(true);
    expect(
      sameModelContext({ file: 'A.rvt', crumbs: [] }, { file: 'A.rvt' }),
    ).toBe(true);
    expect(
      sameModelContext({ crumbs: ['a', 'b'] }, { crumbs: ['b', 'a'] }),
    ).toBe(false);
    expect(sameModelContext({ file: 'A.rvt' }, { file: 'B.rvt' })).toBe(false);
  });
});
