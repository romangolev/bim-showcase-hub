import { describe, expect, it } from 'vitest';
import { decodeId, encodeId } from '../ids.js';
import {
  formatVersionDate,
  mapFolderContents,
  mapHubs,
  mapProjects,
  mapTopFolders,
  mapVersions,
  versionNumberOf,
} from './mapping.js';

describe('ids', () => {
  it('round-trips raw APS ids into url-safe opaque ids', () => {
    const raw = 'urn:adsk.wipprod:dm.lineage:abc?version=3';
    const encoded = encodeId(raw);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeId(encoded)).toBe(raw);
  });

  it('rejects malformed ids', () => {
    expect(() => decodeId('not valid!')).toThrow(/Invalid id/);
    expect(() => decodeId('')).toThrow(/Invalid id/);
    expect(() => decodeId('a')).toThrow(/Invalid id/);
  });
});

describe('mapHubs', () => {
  it('maps hubs and skips resources without an id', () => {
    const nodes = mapHubs([
      { id: 'b.1', attributes: { name: 'Acme' } },
      { attributes: { name: 'broken' } },
    ]);
    expect(nodes).toEqual([
      {
        id: encodeId('b.1'),
        kind: 'hub',
        name: 'Acme',
        hasChildren: true,
        viewable: false,
      },
    ]);
  });
});

describe('mapProjects', () => {
  it('sets parentId to the hub', () => {
    const [node] = mapProjects(
      [{ id: 'b.p', attributes: { name: 'P' } }],
      'b.1',
    );
    expect(node?.kind).toBe('project');
    expect(node?.parentId).toBe(encodeId('b.1'));
  });
});

describe('mapTopFolders', () => {
  it('prefers displayName and parents to the project', () => {
    const [node] = mapTopFolders(
      [{ id: 'f1', attributes: { name: 'raw', displayName: 'Project Files' } }],
      'p1',
    );
    expect(node?.name).toBe('Project Files');
    expect(node?.kind).toBe('folder');
    expect(node?.parentId).toBe(encodeId('p1'));
  });
});

describe('mapFolderContents', () => {
  it('maps folders and items, dropping unnamed and unknown entries', () => {
    const nodes = mapFolderContents(
      [
        { type: 'folders', id: 'f2', attributes: { name: 'Sub' } },
        { type: 'items', id: 'i1', attributes: { displayName: 'a.rvt' } },
        { type: 'items', id: 'i2', attributes: { name: '' } },
        { type: 'other', id: 'x', attributes: { name: 'x' } },
      ],
      'f1',
    );
    expect(nodes.map((n) => [n.kind, n.name])).toEqual([
      ['folder', 'Sub'],
      ['item', 'a.rvt'],
    ]);
    expect(nodes.every((n) => n.parentId === encodeId('f1'))).toBe(true);
  });
});

describe('versions', () => {
  it('formats dates deterministically', () => {
    expect(formatVersionDate('2025-03-04T10:20:30.000Z')).toBe(
      '2025-03-04 10:20',
    );
    expect(formatVersionDate('nonsense')).toBe('unknown date');
    expect(formatVersionDate(undefined)).toBe('unknown date');
  });

  it('reads the version number from attributes or the id', () => {
    expect(versionNumberOf({ attributes: { versionNumber: 4 } })).toBe(4);
    expect(versionNumberOf({ id: 'urn:x?version=7' })).toBe(7);
    expect(versionNumberOf({ id: 'urn:x' })).toBeNull();
  });

  it('flags viewable versions only when a derivative exists', () => {
    const nodes = mapVersions(
      [
        {
          id: 'urn:i?version=2',
          attributes: {
            versionNumber: 2,
            lastModifiedTime: '2025-03-04T10:20:30.000Z',
            lastModifiedUserName: 'Sam',
          },
          relationships: { derivatives: { data: { id: 'dXJuOmFiYw' } } },
        },
        { id: 'urn:i?version=1', attributes: { versionNumber: 1 } },
      ],
      'i',
    );
    expect(nodes[0]).toMatchObject({
      kind: 'version',
      name: 'v2: 2025-03-04 10:20 by Sam',
      viewable: true,
      viewState: 'unknown',
      urn: 'dXJuOmFiYw',
      hasChildren: false,
      parentId: encodeId('i'),
    });
    expect(nodes[1]?.viewable).toBe(false);
    expect(nodes[1]?.viewState).toBe('not-translated');
    expect(nodes[1]?.urn).toBeUndefined();
  });
});
