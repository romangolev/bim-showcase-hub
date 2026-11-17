import { describe, expect, it } from 'vitest';
import {
  documentLoadError,
  NO_GEOMETRY_MESSAGE,
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
