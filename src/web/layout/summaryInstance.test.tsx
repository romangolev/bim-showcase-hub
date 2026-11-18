import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelSummaryPanel } from '../panels/ModelSummaryPanel.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { fireEvent, render, screen, waitFor } from '../test/render.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { ModelViewerContext } from '../viewer/ViewerContext.js';
import { seedInstanceSetting } from './instanceSettings.js';
import { SummaryInstancePane } from './panes.js';

vi.mock('./layoutContext.js', () => ({
  useLayout: () => ({ paneTitle: (id: string) => ({ label: id }) }),
  useMainContent: () => null,
}));
vi.mock('../modal/ModalContext.js', () => ({
  useModal: () => ({ open: vi.fn(), close: vi.fn() }),
}));

let adapter: MockViewerAdapter;

beforeEach(async () => {
  installMemoryStorage();
  adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.load('urn');
});

afterEach(() => adapter.destroy());

describe('summary instance spec', () => {
  it('keeps element scope per instance, apart from the main summary', async () => {
    seedInstanceSetting('modelSummary:1', 'urn');
    seedInstanceSetting('modelSummary:2', 'urn');
    render(
      <ModelViewerContext.Provider value={adapter}>
        <section aria-label="one">
          <SummaryInstancePane instance="1" />
        </section>
        <section aria-label="two">
          <SummaryInstancePane instance="2" />
        </section>
        <section aria-label="main">
          <ModelSummaryPanel />
        </section>
      </ModelViewerContext.Provider>,
    );
    const selects = (await screen.findAllByLabelText(
      'Summarize elements',
    )) as HTMLSelectElement[];
    expect(selects).toHaveLength(3);
    fireEvent.change(selects[0] as HTMLElement, {
      target: { value: 'selected' },
    });
    await waitFor(() => expect(selects[0]?.value).toBe('selected'));
    expect(selects[1]?.value).toBe('all');
    expect(selects[2]?.value).toBe('all');
    expect(window.localStorage.getItem('bsh.summary.scope.v1')).toBeNull();
  });
});
