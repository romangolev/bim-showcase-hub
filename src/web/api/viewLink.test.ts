import { describe, expect, it } from 'vitest';
import {
  encodeView,
  fitView,
  MAX_LINK_CHARTS,
  MAX_LINK_NODES,
  MAX_LINK_PANES,
  MAX_VIEW_CHARS,
  parseView,
  VIEW_FILE_KIND,
  VIEW_FILE_VERSION,
  VIEW_FULL_VERSION,
  VIEW_NODES_VERSION,
  VIEW_SELECTION_CAP,
  viewFileJson,
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

  it('rejects degenerate cameras', () => {
    expect(parseView('1~1,2,3~1,2,3~0,0,1~p~', ids)).toBeNull();
    expect(parseView('1~0,0,0~1,0,0~0,0,0~p~', ids)).toBeNull();
    expect(parseView('1~20000000,0,0~0,0,0~0,0,1~p~', ids)).toBeNull();
    expect(parseView('1~0,0,0~0,-20000000,0~0,0,1~p~', ids)).toBeNull();
    expect(parseView('1~10000000,0,0~0,0,0~0,0,1~p~', ids)).not.toBeNull();
  });

  it('rejects groups whose model index is empty or not an integer', () => {
    const head = '1~0,0,0~1,0,0~0,0,1~p~';
    expect(parseView(`${head}:5`, ids)?.selection).toEqual([]);
    expect(parseView(`${head}1.5:5;x:5; :5`, ids)?.selection).toEqual([]);
    expect(parseView(`${head}0:5`, ids)?.selection).toEqual([
      { modelId: 'a', dbId: 5 },
    ]);
  });

  it('drops selection for unknown models and bad ids', () => {
    expect(
      parseView('1~0,0,0~1,0,0~0,0,1~p~7:1;0:x,3,-1', ids)?.selection,
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

describe('full view link', () => {
  const panes = { open: ['summary', 'chart:1'], collapsed: ['dashboard'] };
  const charts = [
    {
      id: 'dashboard',
      view: { property: 'Category', properties: ['Category'] },
    },
    { id: 'chart:1', view: { property: 'Level', properties: ['Level'] } },
  ];

  it('round trips panes and charts beside the camera and selection', () => {
    const raw = encodeView(
      { camera, selection: [{ modelId: 'a', dbId: 5 }], panes, charts },
      ids,
    );
    expect(raw.startsWith(`${VIEW_FULL_VERSION}~`)).toBe(true);
    const link = parseView(raw, ids);
    expect(link?.camera).toEqual({ ...camera, eye: [1.235, -2, 30] });
    expect(link?.selection).toEqual([{ modelId: 'a', dbId: 5 }]);
    expect(link?.panes).toEqual(panes);
    expect(link?.charts).toEqual(charts);
  });

  it('reads a link written before panes and charts', () => {
    const link = parseView('1~1,2,3~0,0,0~0,0,1~p~0:5', ids);
    expect(link?.selection).toEqual([{ modelId: 'a', dbId: 5 }]);
    expect(link?.panes).toBeUndefined();
    expect(link?.charts).toBeUndefined();
  });

  it('keeps a link inside the size budget by dropping panes and charts', () => {
    const properties = Array.from(
      { length: 200 },
      (_, i) => `Level ${'x'.repeat(60)} ${i}`,
    );
    const fitted = fitView(
      {
        camera,
        selection: [],
        panes,
        charts: [{ id: 'dashboard', view: { property: 'Level', properties } }],
      },
      ids,
    );
    expect(fitted.degraded).toBe(true);
    expect(fitted.view.length).toBeLessThanOrEqual(MAX_VIEW_CHARS);
    expect(fitted.view.startsWith('1~')).toBe(true);
    const link = parseView(fitted.view, ids);
    expect(link?.panes).toBeUndefined();
    expect(link?.charts).toBeUndefined();
    expect(link?.camera.ortho).toBe(false);
  });

  it('caps panes, charts and unknown ids', () => {
    const raw = encodeView(
      {
        camera,
        selection: [],
        panes: {
          open: [...Array.from({ length: 20 }, (_, i) => `chart:${i}`), '../x'],
          collapsed: ['dashboard', 'a b'],
        },
        charts: Array.from({ length: 10 }, (_, i) => ({
          id: `chart:${i}`,
          view: { property: 'Category' },
        })),
      },
      ids,
    );
    const link = parseView(raw, ids);
    expect(link?.panes?.open).toHaveLength(MAX_LINK_PANES);
    expect(link?.panes?.open).not.toContain('../x');
    expect(link?.panes?.collapsed).toEqual(['dashboard']);
    expect(link?.charts).toHaveLength(MAX_LINK_CHARTS);
  });

  it('ignores a broken charts segment but keeps the camera', () => {
    const raw = `2~1,2,3~0,0,0~0,0,1~p~0:5||not-base64`;
    const link = parseView(raw, ids);
    expect(link?.camera.eye).toEqual([1, 2, 3]);
    expect(link?.charts).toBeUndefined();
  });

  it('rejects a view longer than the cap', () => {
    expect(
      parseView(`1~1,2,3~0,0,0~0,0,1~p~${'0'.repeat(MAX_VIEW_CHARS)}`, ids),
    ).toBeNull();
  });
});

describe('nodes in the view link', () => {
  const nodes = [
    { modelId: 'a', hidden: [3, 4], isolated: [5] },
    { modelId: 'b', hidden: [], isolated: [-1] },
  ];

  it('round trips hidden and isolated elements beside the charts', () => {
    const raw = encodeView({ camera, selection: [], nodes }, ids);
    expect(raw.startsWith(`${VIEW_NODES_VERSION}~`)).toBe(true);
    expect(parseView(raw, ids)?.nodes).toEqual(nodes);
  });

  it('reads a link written before the nodes', () => {
    const link = parseView('2~1,2,3~0,0,0~0,0,1~p~0:5~summary|~', ids);
    expect(link?.panes?.open).toEqual(['summary']);
    expect(link?.nodes).toBeUndefined();
  });

  it('drops the nodes when they do not fit the cap', () => {
    const hidden = Array.from({ length: MAX_LINK_NODES + 1 }, (_, i) => i);
    const raw = encodeView(
      {
        camera,
        selection: [],
        nodes: [{ modelId: 'a', hidden, isolated: [] }],
      },
      ids,
    );
    expect(raw.startsWith(`${VIEW_FULL_VERSION}~`)).toBe(false);
    expect(raw.startsWith('1~')).toBe(true);
    expect(parseView(raw, ids)?.nodes).toBeUndefined();
  });

  it('drops the nodes when the full view is too long', () => {
    const fitted = fitView(
      {
        camera,
        selection: [],
        nodes: [{ modelId: 'a', hidden: [1, 2, 3], isolated: [] }],
        charts: Array.from({ length: MAX_LINK_CHARTS }, (_, i) => ({
          id: `chart:${i}`,
          view: {
            properties: Array.from({ length: 200 }, () => 'x'.repeat(40)),
          },
        })),
      },
      ids,
    );
    expect(fitted.degraded).toBe(true);
    expect(parseView(fitted.view, ids)?.nodes).toBeUndefined();
    expect(parseView(fitted.view, ids)?.charts).toBeUndefined();
  });

  it('ignores a broken nodes segment but keeps the camera', () => {
    const link = parseView('3~1,2,3~0,0,0~0,0,1~p~0:5~~|~~x:1', ids);
    expect(link?.camera.eye).toEqual([1, 2, 3]);
    expect(link?.nodes).toBeUndefined();
  });

  it('writes the full view into a JSON file', () => {
    const text = viewFileJson(
      { camera, selection: [], nodes },
      ids,
      new Date(2026, 10, 19),
    );
    const file = JSON.parse(text) as {
      kind: string;
      version: number;
      created: string;
      models: string[];
      view: { nodes: typeof nodes };
    };
    expect(file.kind).toBe(VIEW_FILE_KIND);
    expect(file.version).toBe(VIEW_FILE_VERSION);
    expect(file.models).toEqual(ids);
    expect(file.created).toBe(new Date(2026, 10, 19).toISOString());
    expect(file.view.nodes).toEqual(nodes);
  });
});
