import { describe, expect, it } from 'vitest';
import {
  encodeView,
  parseView,
  VIEW_SELECTION_CAP,
  withViewParam,
} from './viewLink.js';

const camera = {
  eye: [1.23456, -2, 30] as const,
  target: [0, 0, 0] as const,
  up: [0, 0, 1] as const,
  ortho: false,
};
const ids = ['a', 'b'];

describe('view link', () => {
  it('round trips camera and selection by model index', () => {
    const raw = encodeView(
      {
        camera,
        selection: [
          { modelId: 'a', dbId: 5 },
          { modelId: 'b', dbId: 9 },
          { modelId: 'a', dbId: 6 },
        ],
      },
      ids,
    );
    expect(raw).toBe('1~1.235,-2,30~0,0,0~0,0,1~p~0:5,6;1:9');
    expect(parseView(raw, ids)).toEqual({
      camera: { ...camera, eye: [1.235, -2, 30] },
      selection: [
        { modelId: 'a', dbId: 5 },
        { modelId: 'a', dbId: 6 },
        { modelId: 'b', dbId: 9 },
      ],
    });
  });

  it('keeps an orthographic camera and an empty selection', () => {
    const raw = encodeView(
      { camera: { ...camera, ortho: true }, selection: [] },
      ids,
    );
    expect(parseView(raw, ids)?.camera.ortho).toBe(true);
    expect(parseView(raw, ids)?.selection).toEqual([]);
  });

  it('rejects unknown versions and malformed input', () => {
    expect(parseView('2~0,0,0~0,0,0~0,0,1~p~', ids)).toBeNull();
    expect(parseView('1~0,0~0,0,0~0,0,1~p~', ids)).toBeNull();
    expect(parseView('1~a,0,0~0,0,0~0,0,1~p~', ids)).toBeNull();
    expect(parseView('1~0,0,0~0,0,0~0,0,1~x~', ids)).toBeNull();
    expect(parseView(undefined, ids)).toBeNull();
  });

  it('drops selection for unknown models and bad ids', () => {
    expect(
      parseView('1~0,0,0~0,0,0~0,0,1~p~7:1;0:x,3,-1', ids)?.selection,
    ).toEqual([{ modelId: 'a', dbId: 3 }]);
  });

  it('caps the selection', () => {
    const selection = Array.from({ length: 500 }, (_, dbId) => ({
      modelId: 'a',
      dbId,
    }));
    const raw = encodeView({ camera, selection }, ids);
    expect(parseView(raw, ids)?.selection).toHaveLength(VIEW_SELECTION_CAP);
  });

  it('replaces the view parameter on a link', () => {
    expect(withViewParam('https://x.test/model/u?with=b&view=old', 'n')).toBe(
      'https://x.test/model/u?with=b&view=n',
    );
    expect(withViewParam('https://x.test/model/u?view=old', null)).toBe(
      'https://x.test/model/u',
    );
  });
});
