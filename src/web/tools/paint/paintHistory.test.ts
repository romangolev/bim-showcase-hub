import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../../test/mockApi.js';
import { MockViewerAdapter } from '../../viewer/MockViewerAdapter.js';
import type { ModelInfo } from '../../viewer/modelSet.js';
import {
  canRedoPaint,
  canUndoPaint,
  PAINT_RECORDS,
  paintHistoryEntries,
  recordPaint,
  redoPaint,
  replayPaint,
  undoPaint,
} from './paintHistory.js';

const URN = 'urn-paint-history';
const RED = [1, 0, 0, 0.5] as const;
const BLUE = [0, 0, 1, 0.5] as const;

beforeEach(() => {
  installMemoryStorage();
});

async function loaded(version = '1') {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.load(URN, 'Model', { version });
  return adapter;
}

function target(version = '1') {
  return { urn: URN, version };
}

function record(version = '1') {
  return PAINT_RECORDS.get(target(version));
}

async function visibleIds(adapter: MockViewerAdapter) {
  const visible = await adapter.getVisible();
  const ids = visible
    .filter((item) => item.modelId === URN)
    .map((item) => item.dbId);
  expect(ids.length).toBeGreaterThan(1);
  return ids;
}

describe('paint history', () => {
  it('survives a reload and replays on the same model version', async () => {
    const first = await loaded();
    const ids = await visibleIds(first);
    first.selectModelIds(
      ids.slice(0, 2).map((dbId) => ({ modelId: URN, dbId })),
    );
    expect(recordPaint(first, RED, 20)).toBe(true);
    first.destroy();

    const second = await loaded();
    const spy = vi.spyOn(second, 'setModelThemingColor');
    const applied = await replayPaint(second);
    expect(applied).toBe(2);
    expect(spy).toHaveBeenCalledWith(
      ids.slice(0, 2).map((dbId) => ({ modelId: URN, dbId })),
      RED,
    );
    second.destroy();
  });

  it('does not replay paint saved for another model version', async () => {
    const first = await loaded('1');
    const [dbId] = await visibleIds(first);
    first.selectModelIds([{ modelId: URN, dbId: dbId as number }]);
    recordPaint(first, RED, 20);
    first.destroy();

    const second = await loaded('2');
    const spy = vi.spyOn(second, 'setModelThemingColor');
    expect(await replayPaint(second)).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    second.destroy();
  });

  it('undoes and redoes the exact previous paint', async () => {
    const adapter = await loaded();
    const [dbId] = await visibleIds(adapter);
    const items = [{ modelId: URN, dbId: dbId as number }];
    adapter.selectModelIds(items);
    recordPaint(adapter, RED, 20);
    adapter.selectModelIds(items);
    recordPaint(adapter, BLUE, 20);
    const spy = vi.spyOn(adapter, 'setModelThemingColor');
    const cleared = vi.spyOn(adapter, 'clearModelThemingColors');

    expect(canUndoPaint(adapter)).toBe(true);
    expect(undoPaint(adapter)).toBe(true);
    expect(cleared).toHaveBeenCalledWith(items);
    expect(spy).toHaveBeenLastCalledWith(items, RED);
    spy.mockClear();

    expect(canRedoPaint(adapter)).toBe(true);
    expect(redoPaint(adapter)).toBe(true);
    expect(spy).toHaveBeenLastCalledWith(items, BLUE);
    adapter.destroy();
  });

  it('keeps a bounded history controlled by the depth setting', async () => {
    const adapter = await loaded();
    const [dbId] = await visibleIds(adapter);
    const items = [{ modelId: URN, dbId: dbId as number }];
    for (const color of [RED, BLUE, [0, 1, 0, 0.5] as const]) {
      adapter.selectModelIds(items);
      recordPaint(adapter, color, 2);
    }
    expect(record().read().ops).toHaveLength(2);
    expect(undoPaint(adapter)).toBe(true);
    expect(undoPaint(adapter)).toBe(true);
    expect(undoPaint(adapter)).toBe(false);
    adapter.destroy();
  });

  it('drops ids that no longer resolve and keeps the readable ones', async () => {
    const adapter = await loaded();
    const [dbId] = await visibleIds(adapter);
    record().write({
      format: 1,
      urn: URN,
      version: '1',
      ops: [
        {
          action: 'stale-action',
          at: 1,
          rgba: RED,
          dbIds: [999_999, dbId as number],
        },
      ],
      cursor: 1,
    });
    const spy = vi.spyOn(adapter, 'setModelThemingColor');

    expect(await replayPaint(adapter)).toBe(1);
    expect(spy).toHaveBeenCalledWith([{ modelId: URN, dbId }], RED);
    expect(record().read().ops[0]?.dbIds).toEqual([dbId]);
    expect(record().read().ops[0]?.dbIds).not.toContain(999_999);
    adapter.destroy();
  });

  it('lists applied actions newest first', async () => {
    const adapter = await loaded();
    const [dbId] = await visibleIds(adapter);
    const items = [{ modelId: URN, dbId: dbId as number }];
    adapter.selectModelIds(items);
    recordPaint(adapter, RED, 20);
    adapter.selectModelIds(items);
    recordPaint(adapter, BLUE, 20);
    const entries = paintHistoryEntries(adapter);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.rgba).toEqual(BLUE);
    expect(entries[1]?.rgba).toEqual(RED);
    expect(entries[0]?.count).toBe(1);
    undoPaint(adapter);
    expect(paintHistoryEntries(adapter)).toHaveLength(1);
    adapter.destroy();
  });

  it('records paint per model of a combined scene', async () => {
    const adapter = new MockViewerAdapter(document.createElement('div'));
    await adapter.loadModels([{ urn: `${URN}-a` }, { urn: `${URN}-b` }]);
    const models = adapter.getModels();
    const first = models[0] as ModelInfo;
    const second = models[1] as ModelInfo;
    const visible = await adapter.getVisible();
    const firstId = visible.find((item) => item.modelId === first.id)?.dbId;
    const secondId = visible.find((item) => item.modelId === second.id)?.dbId;
    adapter.selectModelIds([
      { modelId: first.id, dbId: firstId as number },
      { modelId: second.id, dbId: secondId as number },
    ]);
    expect(recordPaint(adapter, RED, 20)).toBe(true);

    const entries = paintHistoryEntries(adapter);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.count).toBe(2);
    expect(entries[0]?.models).toBe(2);
    expect(undoPaint(adapter)).toBe(true);
    expect(canUndoPaint(adapter)).toBe(false);
    adapter.destroy();
  });
});
