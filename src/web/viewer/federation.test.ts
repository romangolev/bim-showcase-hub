import { describe, expect, it } from 'vitest';
import {
  documentLoadError,
  NO_GEOMETRY_MESSAGE,
  nodeGuid,
  nodeName,
  nodeRole,
  pickGeometryNode,
  STILL_PROCESSING_MESSAGE,
} from './federation.js';
import type { ModelLoadError } from './modelSet.js';

function doc(status: string | undefined) {
  return {
    getRoot: () => ({
      data: { status },
      getDefaultGeometry: () => null,
      search: () => [],
    }),
  };
}

describe('failure reasons', () => {
  it('reads a translation in progress from the manifest status', () => {
    expect(() => pickGeometryNode(doc('inprogress'), null)).toThrow(
      STILL_PROCESSING_MESSAGE,
    );
    try {
      pickGeometryNode(doc('pending'), null);
    } catch (err) {
      expect((err as ModelLoadError).reason).toBe('processing');
    }
  });

  it('reports no viewable content for a finished manifest', () => {
    expect(() => pickGeometryNode(doc('success'), null)).toThrow(
      NO_GEOMETRY_MESSAGE,
    );
  });

  it('maps document error codes to reasons', () => {
    expect(documentLoadError(4, 'x').reason).toBe('access');
    expect(documentLoadError(5, 'x').reason).toBe('missing');
    expect(documentLoadError(9, 'x').reason).toBe('no-viewable');
    expect(documentLoadError(99, 'x').reason).toBe('unknown');
  });
});

describe('picking a named view', () => {
  const g1 = { is2D: () => false, guid: () => 'g1', name: () => '{3D}' };
  const g2 = { is2D: () => true, guid: () => 'g2', name: () => 'A101 - Plans' };
  const views = [g1, g2];

  function viewsDoc() {
    return {
      getRoot: () => ({
        getDefaultGeometry: () => g1,
        search: (query: { type: string; role?: string }) =>
          views.filter(
            (node) => !query.role || node.is2D() === (query.role === '2d'),
          ),
      }),
    };
  }

  it('picks the requested view by guid', () => {
    expect(pickGeometryNode(viewsDoc(), null, 'g2')).toBe(g2);
    expect(pickGeometryNode(viewsDoc(), null, 'g1')).toBe(g1);
  });

  it('falls back to the default view for an unknown guid', () => {
    expect(pickGeometryNode(viewsDoc(), null, 'nope')).toBe(g1);
  });

  it('falls back to a node of the anchor dimension', () => {
    expect(pickGeometryNode(viewsDoc(), { is2d: false }, 'g2')).toBe(g1);
    expect(pickGeometryNode(viewsDoc(), { is2d: true }, 'g2')).toBe(g2);
  });

  it('reads the guid, name and role of a bubble node', () => {
    expect(nodeGuid(g2)).toBe('g2');
    expect(nodeName(g2)).toBe('A101 - Plans');
    expect(nodeRole(g2)).toBe('2d');
    expect(nodeGuid({ data: { guid: 'd1' } })).toBe('d1');
    expect(nodeGuid(null)).toBeUndefined();
    expect(nodeRole({ data: { role: '2d' } })).toBe('2d');
  });
});
