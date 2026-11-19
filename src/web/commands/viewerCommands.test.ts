import { beforeEach, describe, expect, it } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { viewerCommands } from './viewerCommands.js';

beforeEach(() => {
  installMemoryStorage();
});

async function loaded() {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.loadModels([{ urn: 'urn-a' }]);
  return adapter;
}

function invertCommand(adapter: MockViewerAdapter | null) {
  return viewerCommands(adapter).find(
    (command) => command.id === 'viewer.invertSelection',
  );
}

async function firstThree(adapter: MockViewerAdapter) {
  const [first, second, third] = await adapter.getVisible();
  if (!first || !second || !third) {
    throw new Error('The mock model has too few elements');
  }
  return { first, second, third };
}

const host = { openModal: () => undefined };

describe('invert selection', () => {
  it('is unavailable without a model or a selection', async () => {
    expect(invertCommand(null)?.disabled).toBe('Open a model first');
    const adapter = await loaded();
    expect(invertCommand(adapter)?.disabled).toBe('Select elements first');
    adapter.destroy();
  });

  it('selects the visible elements that are not selected', async () => {
    const adapter = await loaded();
    const { first, second, third } = await firstThree(adapter);
    adapter.selectModelIds([first, second]);
    await invertCommand(adapter)?.run(host);
    expect(adapter.getModelSelection()).not.toContainEqual(first);
    expect(adapter.getModelSelection()).not.toContainEqual(second);
    expect(adapter.getModelSelection()).toContainEqual(third);
    expect(adapter.getModelSelection()).toHaveLength(
      (await adapter.getVisible()).length - 2,
    );
    adapter.destroy();
  });

  it('clears the selection when it covers everything visible', async () => {
    const adapter = await loaded();
    adapter.selectModelIds(await adapter.getVisible());
    await invertCommand(adapter)?.run(host);
    expect(adapter.getModelSelection()).toEqual([]);
    adapter.destroy();
  });

  it('leaves out hidden elements', async () => {
    const adapter = await loaded();
    const { first, second, third } = await firstThree(adapter);
    adapter.hideModelIds([second]);
    adapter.selectModelIds([first]);
    await invertCommand(adapter)?.run(host);
    const selected = adapter.getModelSelection();
    expect(selected).toContainEqual(third);
    expect(selected).not.toContainEqual(second);
    adapter.destroy();
  });

  it('leaves out elements outside the isolation', async () => {
    const adapter = await loaded();
    const { first, second, third } = await firstThree(adapter);
    adapter.isolateModelIds([first, second]);
    adapter.selectModelIds([first]);
    await invertCommand(adapter)?.run(host);
    const selected = adapter.getModelSelection();
    expect(selected).toEqual([second]);
    expect(selected).not.toContainEqual(third);
    adapter.destroy();
  });
});
