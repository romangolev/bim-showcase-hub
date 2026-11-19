import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DASHBOARD_PROPERTIES } from '../extensions/dashboardData.js';
import { DEFAULT_DASHBOARD_VIEW } from '../extensions/dashboardPresets.js';
import { DashboardPanel } from '../panels/DashboardPanel.js';
import {
  DASHBOARD_SETTINGS_ID,
  DASHBOARD_SETTINGS_MODAL,
  DashboardSettingsBody,
} from '../panels/DashboardSettings.js';
import { PANE_SETTINGS } from '../settings/paneSettings.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { fireEvent, render, screen, waitFor } from '../test/render.js';
import { publishActiveAdapter } from '../viewer/activeAdapterStore.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { ModelViewerContext } from '../viewer/ViewerContext.js';
import {
  setDashboardSettingsTarget,
  useDashboardSettingsTarget,
} from './dashboardTarget.js';
import { chartSetting, forgetInstanceSetting } from './instanceSettings.js';
import { ChartInstancePane, DashboardPane } from './panes.js';

const modal = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock('chart.js', () => {
  class Chart {
    static register = vi.fn();
    static defaults = { font: {}, color: '' };
    destroy = vi.fn();
    update = vi.fn();
  }
  const stub = {};
  return {
    Chart,
    ArcElement: stub,
    BarController: stub,
    BarElement: stub,
    CategoryScale: stub,
    LinearScale: stub,
    DoughnutController: stub,
    Tooltip: stub,
  };
});
vi.mock('./layoutContext.js', () => ({
  useLayout: () => ({
    paneTitle: (id: string) => ({ label: id }),
    mode: 'docked',
    isCollapsed: () => false,
    setCollapsed: vi.fn(),
    resizeSignal: () => 0,
  }),
  useMainContent: () => null,
}));
vi.mock('../modal/ModalContext.js', () => ({
  useModal: () => ({ open: modal.open, close: vi.fn() }),
}));

let adapter: MockViewerAdapter;
let seen: string | null = 'unset';

function Probe() {
  seen = useDashboardSettingsTarget();
  return null;
}

beforeEach(async () => {
  installMemoryStorage();
  setDashboardSettingsTarget(null);
  seen = 'unset';
  modal.open.mockClear();
  adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.load('urn');
  publishActiveAdapter(adapter);
});

afterEach(() => {
  publishActiveAdapter(null);
  adapter.destroy();
  setDashboardSettingsTarget(null);
});

describe('chart instance settings', () => {
  it('opens settings and edits only its own view and properties', async () => {
    PANE_SETTINGS.dashboard.view.write({
      ...DEFAULT_DASHBOARD_VIEW,
      property: 'Category',
      properties: ['Category', 'Level'],
    });
    chartSetting('chart:1').write({
      ...DEFAULT_DASHBOARD_VIEW,
      property: 'Name',
      properties: ['Name'],
    });
    render(
      <ModelViewerContext.Provider value={adapter}>
        <ChartInstancePane instance="1" />
        <DashboardPanel adapter={adapter} />
        <DashboardSettingsBody />
        <Probe />
      </ModelViewerContext.Provider>,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Dashboard settings' }),
    );
    expect(modal.open).toHaveBeenCalledWith(DASHBOARD_SETTINGS_ID);
    expect(seen).toBe('chart:1');
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Category' }));
    await waitFor(() =>
      expect(chartSetting('chart:1').read().properties).toEqual([
        'Name',
        'Category',
      ]),
    );
    expect(chartSetting('chart:1').read().property).toBe('Name');
    expect(PANE_SETTINGS.dashboard.view.read()).toMatchObject({
      property: 'Category',
      properties: ['Category', 'Level'],
    });
    expect(
      JSON.parse(window.localStorage.getItem('bsh.dashboard.view.v1') ?? '{}')
        .properties,
    ).toEqual(['Category', 'Level']);
  });

  it('clears the target when the settings modal closes', () => {
    setDashboardSettingsTarget('chart:2');
    DASHBOARD_SETTINGS_MODAL.onClose?.();
    render(<Probe />);
    expect(seen).toBeNull();
  });

  it('clears the target when the main dashboard opens its settings', async () => {
    setDashboardSettingsTarget('chart:1');
    render(
      <ModelViewerContext.Provider value={adapter}>
        <DashboardPane />
        <Probe />
      </ModelViewerContext.Provider>,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Dashboard settings' }),
    );
    expect(modal.open).toHaveBeenCalledWith(DASHBOARD_SETTINGS_ID);
    expect(seen).toBeNull();
  });

  it('resets the chart to its defaults without touching the main dashboard', async () => {
    PANE_SETTINGS.dashboard.view.write({
      ...DEFAULT_DASHBOARD_VIEW,
      property: 'Level',
      properties: ['Level'],
    });
    chartSetting('chart:5').write({
      ...DEFAULT_DASHBOARD_VIEW,
      kind: 'bar',
      property: 'Name',
      properties: ['Name'],
    });
    setDashboardSettingsTarget('chart:5');
    render(
      <ModelViewerContext.Provider value={adapter}>
        <DashboardSettingsBody />
      </ModelViewerContext.Provider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Reset chart' }));
    await waitFor(() =>
      expect(chartSetting('chart:5').read()).toMatchObject({
        kind: 'both',
        property: DEFAULT_DASHBOARD_VIEW.property,
        properties: DEFAULT_DASHBOARD_PROPERTIES,
      }),
    );
    expect(PANE_SETTINGS.dashboard.view.read()).toMatchObject({
      property: 'Level',
      properties: ['Level'],
    });
    expect(PANE_SETTINGS.dashboard.action.has()).toBe(false);
  });

  it('drops the target when its chart instance is forgotten', async () => {
    chartSetting('chart:3').write({ ...DEFAULT_DASHBOARD_VIEW });
    setDashboardSettingsTarget('chart:3');
    render(<Probe />);
    expect(seen).toBe('chart:3');
    forgetInstanceSetting('chart:3');
    await waitFor(() => expect(seen).toBeNull());
  });
});
