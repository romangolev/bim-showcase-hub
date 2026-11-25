import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setStorageAdapter } from '../storage.js';
import { memoryAdapter } from '../storageAdapter.js';
import { render, screen } from '../test/render.js';
import { withSummaryProperties } from '../test/summaryProperties.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { ColorsPanel } from './ColorsPanel.js';
import { DashboardPanel } from './DashboardPanel.js';
import { ExportPanel } from './ExportPanel.js';
import { ModelSummaryPanel } from './ModelSummaryPanel.js';

const adapters: MockViewerAdapter[] = [];

beforeEach(() => {
  setStorageAdapter(memoryAdapter());
});

afterEach(() => {
  for (const adapter of adapters.splice(0)) adapter.destroy();
});

async function withBrokenModel(): Promise<MockViewerAdapter> {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.loadModels([
    { urn: 'urn-a', name: 'Arch' },
    { urn: 'urn-noprops', name: 'Broken DB' },
  ]);
  adapters.push(adapter);
  return adapter;
}

const panels: [string, (adapter: MockViewerAdapter) => ReactElement][] = [
  [
    'Summary',
    (adapter) => (
      <ModelSummaryPanel
        adapter={adapter}
        {...withSummaryProperties(['Category'])}
      />
    ),
  ],
  ['Dashboard', (adapter) => <DashboardPanel adapter={adapter} />],
  ['Colors', (adapter) => <ColorsPanel adapter={adapter} />],
  [
    'Export',
    (adapter) => <ExportPanel adapter={adapter} fileName="out.xlsx" />,
  ],
];

describe('a model whose properties cannot be read', () => {
  it.each(panels)('is announced in %s', async (_name, panel) => {
    const adapter = await withBrokenModel();
    render(panel(adapter));
    expect(
      await screen.findByText(/Properties unavailable for Broken DB/),
    ).toBeInTheDocument();
  });
});
