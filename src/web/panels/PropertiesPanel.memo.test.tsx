import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '../test/render.js';
import { createMockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { buildMockElements } from '../viewer/mockModel.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { PropertiesPanel } from './PropertiesPanel.js';

const calls = vi.hoisted(() => ({ grouped: 0 }));

vi.mock('./propertiesView.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./propertiesView.js')>();
  return {
    ...actual,
    groupProperties: (...args: Parameters<typeof actual.groupProperties>) => {
      calls.grouped += 1;
      return actual.groupProperties(...args);
    },
  };
});

async function load(urns: string[]): Promise<ViewerAdapter> {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = await createMockViewerAdapter(host);
  await adapter.loadModels(urns.map((urn) => ({ urn, name: urn })));
  return adapter;
}

describe('PropertiesPanel grouping', () => {
  it('does not regroup rows when only the notice changes', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    const adapter = await load(['urn-a']);
    const modelId = adapter.getModels()[0]?.id ?? '';
    const element = buildMockElements()[0];
    render(<PropertiesPanel adapter={adapter} />);
    act(() => {
      adapter.selectModelIds([{ modelId, dbId: element?.dbId ?? 0 }]);
    });
    await screen.findByRole('table', { name: 'Identity Data properties' });
    const before = calls.grouped;
    fireEvent.click(await screen.findByRole('button', { name: 'Copy Level' }));
    expect(await screen.findByText('Copied')).toBeInTheDocument();
    expect(calls.grouped).toBe(before);
  });
});
