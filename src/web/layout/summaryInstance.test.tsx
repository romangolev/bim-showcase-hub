import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelSummaryPanel } from '../panels/ModelSummaryPanel.js';
import {
  SUMMARY_SETTINGS_MODAL,
  SummarySettingsBody,
} from '../panels/SummarySettings.js';
import { PANE_SETTINGS } from '../settings/paneSettings.js';
import { forgetPersonal } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { fireEvent, render, screen, waitFor } from '../test/render.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { ModelViewerContext } from '../viewer/ViewerContext.js';
import {
  forgetInstanceSetting,
  seedInstanceSetting,
  summarySetting,
} from './instanceSettings.js';
import { SummaryInstancePane } from './panes.js';
import {
  setSummarySettingsTarget,
  useSummarySettingsTarget,
} from './summaryTarget.js';

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

  const mountThree = () =>
    render(
      <ModelViewerContext.Provider value={adapter}>
        <SummaryInstancePane instance="1" />
        <SummaryInstancePane instance="2" />
        <ModelSummaryPanel />
        <SummarySettingsBody />
      </ModelViewerContext.Provider>,
    );
  const densities = () =>
    Array.from(document.querySelectorAll('.bsh-summary')).map((el) =>
      el.getAttribute('data-density'),
    );

  it('edits view and action of the targeted instance only', async () => {
    seedInstanceSetting('modelSummary:1', 'urn');
    seedInstanceSetting('modelSummary:2', 'urn');
    setSummarySettingsTarget('modelSummary:1');
    mountThree();
    await screen.findAllByLabelText('Summarize elements');
    fireEvent.change(screen.getByLabelText('Density'), {
      target: { value: 'compact' },
    });
    fireEvent.change(screen.getByLabelText('Sort by'), {
      target: { value: 'value' },
    });
    fireEvent.change(screen.getByLabelText('Row click'), {
      target: { value: 'isolate' },
    });
    await waitFor(() =>
      expect(densities()).toEqual(['compact', 'comfortable', 'comfortable']),
    );
    expect(summarySetting('modelSummary:1').read()).toMatchObject({
      view: { density: 'compact', sort: 'value' },
      action: 'isolate',
    });
    expect(summarySetting('modelSummary:2').read()).toMatchObject({
      view: { density: 'comfortable', sort: 'count' },
      action: 'select',
    });
    expect(PANE_SETTINGS.summary.view.has()).toBe(false);
    expect(PANE_SETTINGS.summary.action.has()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));
    await waitFor(() =>
      expect(densities()).toEqual([
        'comfortable',
        'comfortable',
        'comfortable',
      ]),
    );
    setSummarySettingsTarget(null);
  });

  it('edits the global values when no instance is targeted', async () => {
    seedInstanceSetting('modelSummary:1', 'urn');
    setSummarySettingsTarget(null);
    mountThree();
    await screen.findAllByLabelText('Summarize elements');
    fireEvent.change(screen.getByLabelText('Density'), {
      target: { value: 'compact' },
    });
    await waitFor(() =>
      expect(densities()).toEqual(['comfortable', 'comfortable', 'compact']),
    );
    expect(summarySetting('modelSummary:1').read().view.density).toBe(
      'comfortable',
    );
  });

  it('seeds a new instance from the main view and action', () => {
    PANE_SETTINGS.summary.view.write({
      ...PANE_SETTINGS.summary.view.initial,
      density: 'compact',
    });
    PANE_SETTINGS.summary.action.write('zoom');
    seedInstanceSetting('modelSummary:5', null);
    expect(summarySetting('modelSummary:5').read()).toMatchObject({
      scope: 'all',
      view: { density: 'compact' },
      action: 'zoom',
    });
  });

  it('loads a spec written before view and action existed with defaults', () => {
    window.localStorage.setItem(
      'bsh.pane.modelSummary.7.v1',
      JSON.stringify({ scope: 'urn', elements: 'selected', properties: ['A'] }),
    );
    expect(summarySetting('modelSummary:7').read()).toMatchObject({
      scope: 'urn',
      elements: 'selected',
      properties: ['A'],
      view: { density: 'comfortable', sort: 'count', hiddenColumns: [] },
      action: 'select',
    });
  });

  it('scrubs view and action on close and on forget', () => {
    seedInstanceSetting('modelSummary:8', 'urn');
    seedInstanceSetting('modelSummary:9', 'urn');
    const key = (n: number) => `bsh.pane.modelSummary.${n}.v1`;
    forgetInstanceSetting('modelSummary:8');
    expect(window.localStorage.getItem(key(8))).toBeNull();
    expect(window.localStorage.getItem(key(9))).toContain('"view"');
    forgetPersonal();
    expect(window.localStorage.getItem(key(9))).toBeNull();
  });

  it('clears the target when the settings modal closes', () => {
    setSummarySettingsTarget('modelSummary:2');
    SUMMARY_SETTINGS_MODAL.onClose?.();
    let seen: string | null = 'unset';
    const Probe = () => {
      seen = useSummarySettingsTarget();
      return null;
    };
    render(<Probe />);
    expect(seen).toBeNull();
  });

  it('drops the target and does not recreate the key when its instance is forgotten', async () => {
    seedInstanceSetting('modelSummary:2', 'urn');
    setSummarySettingsTarget('modelSummary:2');
    const key = 'bsh.pane.modelSummary.2.v1';
    render(
      <ModelViewerContext.Provider value={adapter}>
        <SummarySettingsBody />
      </ModelViewerContext.Provider>,
    );
    await screen.findByLabelText('Density');
    forgetInstanceSetting('modelSummary:2');
    await waitFor(() => expect(screen.getByLabelText('Density')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Density'), {
      target: { value: 'compact' },
    });
    expect(window.localStorage.getItem(key)).toBeNull();
  });
});
