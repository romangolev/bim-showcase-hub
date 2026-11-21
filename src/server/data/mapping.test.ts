import { describe, expect, it } from 'vitest';
import { decodeId, encodeId } from '../ids.js';
import {
  formatVersionDate,
  mapFolderContents,
  mapHubs,
  mapProjects,
  mapTopFolders,
  mapVersions,
  markLatest,
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
        hubType: 'unknown',
      },
    ]);
  });

  it('maps the extension type to a hub type', () => {
    const types = [
      'hubs:autodesk.a360:PersonalHub',
      'hubs:autodesk.core:Hub',
      'hubs:autodesk.bim360:Account',
      'hubs:autodesk.other:Thing',
    ];
    const nodes = mapHubs([
      ...types.map((type, index) => ({
        id: `h${index}`,
        attributes: { name: type, extension: { type } },
      })),
      { id: 'none', attributes: { name: 'none' } },
    ]);
    expect(nodes.map((node) => node.hubType)).toEqual([
      'personal',
      'team',
      'account',
      'unknown',
      'unknown',
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

  it('takes the tip number and derivative urn of each item from included', () => {
    const nodes = mapFolderContents(
      [
        {
          type: 'items',
          id: 'i1',
          attributes: { displayName: 'a.rvt' },
          relationships: { tip: { data: { id: 'v?version=4' } } },
        },
      ],
      'f1',
      [
        {
          id: 'v?version=4',
          attributes: { versionNumber: 4 },
          relationships: { derivatives: { data: { id: 'dXJu' } } },
        },
      ],
    );
    expect(nodes[0]?.versionNumber).toBe(4);
    expect(nodes[0]?.tipUrn).toBe('dXJu');
  });

  it('leaves items without an included tip unchanged', () => {
    const nodes = mapFolderContents(
      [{ type: 'items', id: 'i1', attributes: { displayName: 'a.rvt' } }],
      'f1',
      [],
    );
    expect(nodes[0]?.tipUrn).toBeUndefined();
  });
});

describe('metadata', () => {
  it('maps modified time, author and size onto folder contents and versions', () => {
    const [item] = mapFolderContents(
      [
        {
          type: 'items',
          id: 'i1',
          attributes: {
            displayName: 'a.rvt',
            lastModifiedTime: '2025-03-04T10:20:30.000Z',
            lastModifiedUserName: 'Sam',
          },
        },
      ],
      'f1',
    );
    expect(item).toMatchObject({
      modifiedAt: '2025-03-04T10:20:30.000Z',
      modifiedBy: 'Sam',
    });
    const [version] = mapVersions(
      [
        {
          id: 'urn:i?version=1',
          attributes: {
            versionNumber: 1,
            lastModifiedTime: '2025-03-04T10:20:30.000Z',
            storageSize: 1234,
          },
        },
      ],
      'i',
    );
    expect(version).toMatchObject({ size: 1234 });
    expect(version?.modifiedBy).toBeUndefined();
  });

  it('omits unusable values', () => {
    const [item] = mapFolderContents(
      [
        {
          type: 'items',
          id: 'i1',
          attributes: { name: 'a', lastModifiedTime: 'nonsense' },
        },
      ],
      'f1',
    );
    expect(item).not.toHaveProperty('modifiedAt');
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

describe('markLatest', () => {
  it('marks only the highest version number as latest', () => {
    const nodes = mapVersions(
      [
        { id: 'v?version=1', attributes: { versionNumber: 1 } },
        { id: 'v?version=3', attributes: { versionNumber: 3 } },
        { id: 'v?version=2', attributes: { versionNumber: 2 } },
      ],
      'item',
    );
    const marked = markLatest(nodes);
    expect(marked.map((node) => node.versionNumber)).toEqual([1, 3, 2]);
    expect(marked.map((node) => node.latest ?? false)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('marks nothing when no version has a number', () => {
    const marked = markLatest(mapVersions([{ id: 'odd' }], 'item'));
    expect(marked[0]?.latest).toBeUndefined();
  });
});
