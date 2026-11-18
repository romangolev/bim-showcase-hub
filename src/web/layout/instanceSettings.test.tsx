import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardPanel } from '../panels/DashboardPanel.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { fireEvent, render, screen } from '../test/render.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import {
  chartSetting,
  forgetInstanceSetting,
  instanceSettingKey,
  sanitizeSummarySpec,
  summarySetting,
} from './instanceSettings.js';

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

describe('instance settings', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it('keys per instance and keeps one spec object per key', () => {
    expect(instanceSettingKey('chart:2')).toBe('bsh.pane.chart.2.v1');
    expect(chartSetting('chart:1')).toBe(chartSetting('chart:1'));
    expect(chartSetting('chart:1')).not.toBe(chartSetting('chart:2'));
    expect(summarySetting('modelSummary:1').key).toBe(
      'bsh.pane.modelSummary.1.v1',
    );
  });

  it('sanitizes the chart spec and never keeps a preset', () => {
    const spec = chartSetting('chart:9');
    const view = spec.sanitize({
      preset: 'health',
      kind: 'bar',
      scope: 'urn1',
    });
    expect(view).toMatchObject({ preset: null, kind: 'bar', scope: 'urn1' });
    expect(spec.sanitize({ scope: 5 }).scope).toBeUndefined();
    expect(sanitizeSummarySpec({ scope: '' })).toEqual({ scope: 'all' });
  });

  it('removes the stored spec when the instance is forgotten', () => {
    window.localStorage.setItem('bsh.pane.chart.3.v1', '{}');
    forgetInstanceSetting('chart:3');
    expect(window.localStorage.getItem('bsh.pane.chart.3.v1')).toBeNull();
    window.localStorage.setItem('bsh.pane.chart.3.v1', '{}');
    forgetInstanceSetting('chart');
    expect(window.localStorage.getItem('bsh.pane.chart.3.v1')).toBe('{}');
  });

  it('charts independently per instance and persists each spec', async () => {
    const adapter = new MockViewerAdapter(document.createElement('div'));
    await adapter.load('urn');
    render(
      <>
        <section aria-label="first">
          <DashboardPanel adapter={adapter} setting={chartSetting('chart:1')} />
        </section>
        <section aria-label="second">
          <DashboardPanel adapter={adapter} setting={chartSetting('chart:2')} />
        </section>
      </>,
    );
    const selects = await screen.findAllByLabelText('Group by');
    expect(selects).toHaveLength(2);
    fireEvent.change(selects[1] as HTMLElement, { target: { value: 'Level' } });
    expect(
      await screen.findAllByRole('img', {
        name: 'Bar chart of element counts by Level',
      }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole('img', {
        name: 'Bar chart of element counts by Category',
      }),
    ).toHaveLength(1);
    expect(
      JSON.parse(window.localStorage.getItem('bsh.pane.chart.2.v1') ?? '{}')
        .property,
    ).toBe('Level');
    expect(window.localStorage.getItem('bsh.pane.chart.1.v1')).toBeNull();
    adapter.destroy();
  });
});
