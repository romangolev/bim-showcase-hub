import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DASHBOARD_PROPERTIES } from '../extensions/dashboardData.js';
import { DashboardPanel } from '../panels/DashboardPanel.js';
import { forgetPersonal, usePersisted } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { fireEvent, render, screen } from '../test/render.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import {
  chartSetting,
  forgetInstanceSetting,
  instanceSettingKey,
  sanitizeSummarySpec,
  seedInstanceSetting,
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

  it('sanitizes the chart spec from the old and the new shape', () => {
    const spec = chartSetting('chart:9');
    const view = spec.sanitize({
      preset: 'health',
      kind: 'bar',
      scope: 'urn1',
    });
    expect(view.scope).toBe('urn1');
    expect(view.charts.map((chart) => chart.property)).toEqual([
      'Category',
      'Level',
      'Assembly Code',
      'Classification Code',
    ]);
    expect(spec.sanitize({ scope: 5 }).scope).toBeUndefined();
    expect(spec.sanitize({ scope: 5 })).toMatchObject({
      properties: DEFAULT_DASHBOARD_PROPERTIES,
    });
    expect(sanitizeSummarySpec({ scope: '' })).toMatchObject({
      scope: 'all',
      elements: 'all',
    });
    expect(
      sanitizeSummarySpec({ elements: 'selected', properties: ['Name'] }),
    ).toMatchObject({ elements: 'selected', properties: ['Name'] });
  });

  it('removes the stored spec when the instance is forgotten', () => {
    window.localStorage.setItem('bsh.pane.chart.3.v1', '{}');
    forgetInstanceSetting('chart:3');
    expect(window.localStorage.getItem('bsh.pane.chart.3.v1')).toBeNull();
    window.localStorage.setItem('bsh.pane.chart.3.v1', '{}');
    forgetInstanceSetting('chart');
    expect(window.localStorage.getItem('bsh.pane.chart.3.v1')).toBe('{}');
  });

  it('shows a seeded scope in a mounted hook', async () => {
    const view = renderHook(() =>
      usePersisted(summarySetting('modelSummary:1')),
    );
    expect(view.result.current[0]).toMatchObject({
      scope: 'all',
      elements: 'all',
    });
    await act(async () => {
      seedInstanceSetting('modelSummary:1', 'urn-a');
      await Promise.resolve();
    });
    expect(view.result.current[0]).toMatchObject({ scope: 'urn-a' });
  });

  it('scrubs per-instance keys and cached specs on forget', () => {
    seedInstanceSetting('modelSummary:1', 'urn-a');
    const before = summarySetting('modelSummary:1');
    expect(
      window.localStorage.getItem('bsh.pane.modelSummary.1.v1'),
    ).not.toBeNull();
    forgetPersonal();
    expect(
      window.localStorage.getItem('bsh.pane.modelSummary.1.v1'),
    ).toBeNull();
    expect(summarySetting('modelSummary:1')).not.toBe(before);
  });

  it('does not resurrect old settings for a reused id', () => {
    seedInstanceSetting('modelSummary:1', 'urn-a');
    const view = renderHook(() =>
      usePersisted(summarySetting('modelSummary:1')),
    );
    expect(view.result.current[0]).toMatchObject({ scope: 'urn-a' });
    act(() => forgetPersonal());
    expect(view.result.current[0]).toMatchObject({
      scope: 'all',
      elements: 'all',
    });
    expect(
      renderHook(() => usePersisted(summarySetting('modelSummary:1'))).result
        .current[0],
    ).toMatchObject({ scope: 'all', elements: 'all' });
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
    const bars = await screen.findAllByRole('button', {
      name: /^Options for Bar chart of element counts by Category/,
    });
    expect(bars).toHaveLength(2);
    fireEvent.click(bars[1] as HTMLElement);
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: 'Group by Level' }),
    );
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
        .charts[0].property,
    ).toBe('Level');
    expect(window.localStorage.getItem('bsh.pane.chart.1.v1')).toBeNull();
    adapter.destroy();
  });

  it('keeps a property list per chart instance across a reload', async () => {
    window.localStorage.setItem(
      'bsh.pane.chart.1.v1',
      JSON.stringify({ properties: ['Name'] }),
    );
    window.localStorage.setItem(
      'bsh.pane.chart.2.v1',
      JSON.stringify({ properties: ['Level'] }),
    );
    const adapter = new MockViewerAdapter(document.createElement('div'));
    await adapter.load('urn');
    const charts = () => (
      <>
        <section aria-label="first">
          <DashboardPanel adapter={adapter} setting={chartSetting('chart:1')} />
        </section>
        <section aria-label="second">
          <DashboardPanel adapter={adapter} setting={chartSetting('chart:2')} />
        </section>
      </>
    );
    const view = render(charts());
    expect(
      await screen.findAllByRole('img', {
        name: 'Bar chart of element counts by Name',
      }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole('img', {
        name: 'Bar chart of element counts by Level',
      }),
    ).toHaveLength(1);
    view.unmount();
    render(charts());
    expect(
      await screen.findAllByRole('img', {
        name: 'Bar chart of element counts by Name',
      }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole('img', {
        name: 'Bar chart of element counts by Level',
      }),
    ).toHaveLength(1);
    expect(
      JSON.parse(window.localStorage.getItem('bsh.pane.chart.1.v1') ?? '{}')
        .properties,
    ).toEqual(['Name']);
    adapter.destroy();
  });
});
