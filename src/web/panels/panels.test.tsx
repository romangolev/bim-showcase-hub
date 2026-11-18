import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BSH_KEYS } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { act, fireEvent, render, screen, waitFor } from '../test/render.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { buildMockElements } from '../viewer/mockModel.js';
import { DashboardPanel } from './DashboardPanel.js';
import { DashboardSettingsBody } from './DashboardSettings.js';
import { ModelSummaryPanel } from './ModelSummaryPanel.js';
import { SummarySettingsBody } from './SummarySettings.js';
import { SummaryTable } from './SummaryTable.js';

const made = vi.hoisted(() => ({
  configs: [] as {
    data: { labels: string[]; datasets: { borderWidth: number[] }[] };
    options: { onClick: (e: unknown, els: { index: number }[]) => void };
  }[],
}));

vi.mock('chart.js', () => {
  class Chart {
    static register = vi.fn();
    static defaults = { font: {}, color: '' };
    destroy = vi.fn();
    update = vi.fn();
    data: unknown;
    constructor(_canvas: unknown, config: (typeof made.configs)[number]) {
      this.data = config.data;
      made.configs.push(config);
    }
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

const adapters: MockViewerAdapter[] = [];

async function loaded(): Promise<MockViewerAdapter> {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.load('urn');
  adapters.push(adapter);
  return adapter;
}

afterEach(() => {
  for (const a of adapters.splice(0)) a.destroy();
});

describe('ModelSummaryPanel', () => {
  it('renders counts in a table', async () => {
    const adapter = await loaded();
    render(
      <ModelSummaryPanel adapter={adapter} propertyNames={['Category']} />,
    );
    const walls = await screen.findByRole('cell', { name: 'Walls' });
    const row = walls.closest('tr');
    expect(row).not.toBeNull();
    expect(row?.querySelectorAll('td')[2]?.textContent).toMatch(/^\d+$/);
    expect(
      screen.getByRole('columnheader', { name: 'Count' }),
    ).toBeInTheDocument();
  });

  it('offers a toggle to show every row when there are more than twelve', async () => {
    const adapter = await loaded();
    const { container } = render(
      <ModelSummaryPanel
        adapter={adapter}
        propertyNames={['Category', 'Name', 'Level', 'Assembly Code']}
      />,
    );
    const toggle = await screen.findByRole('button', {
      name: /^Show all \d+ rows$/,
    });
    const card = container.querySelector('section');
    expect(card).toHaveAttribute('data-rows-collapsed', 'true');
    fireEvent.click(toggle);
    expect(card).toHaveAttribute('data-rows-collapsed', 'false');
    expect(
      screen.getByRole('button', { name: 'Show fewer rows' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('prompts to load a model when there is no adapter', () => {
    render(<ModelSummaryPanel />);
    expect(screen.getByText(/No model loaded yet/)).toBeInTheDocument();
  });
});

describe('ModelSummaryPanel collapse and counts', () => {
  it('collapses with an accessible toggle and inert body', async () => {
    const adapter = await loaded();
    const onChange = vi.fn();
    render(
      <ModelSummaryPanel
        adapter={adapter}
        propertyNames={['Category']}
        onCollapsedChange={onChange}
      />,
    );
    const toggle = screen.getByRole('button', {
      name: 'Collapse Model summary',
    });
    const body = document.getElementById(
      toggle.getAttribute('aria-controls') ?? '',
    );
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(body).toHaveAttribute('inert');
    expect(body).toHaveAttribute('aria-hidden', 'true');
    expect(
      document.querySelector('.bsh-summary')?.getAttribute('data-collapsed'),
    ).toBe('true');
  });

  it('honours the controlled collapsed prop', () => {
    render(<ModelSummaryPanel collapsed onCollapsedChange={() => {}} />);
    expect(
      screen.getByRole('button', { name: 'Expand Model summary' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('formats large counts with separators and never wraps them', () => {
    render(
      <SummaryTable
        entries={[{ property: 'Category', value: 'Walls', count: 104686 }]}
      />,
    );
    const cell = screen.getByText('104,686').closest('td');
    expect(cell).toHaveClass('bsh-num');
    expect(cell).toHaveAttribute('title', '104,686');
  });
});

describe('shared property read', () => {
  it('reads the union of both panels properties once', async () => {
    const adapter = await loaded();
    const spy = vi.spyOn(adapter, 'getLeafProperties');
    render(
      <>
        <DashboardPanel adapter={adapter} />
        <ModelSummaryPanel adapter={adapter} />
      </>,
    );
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Category',
    });
    await screen.findAllByText(/Assembly Code/);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('DashboardPanel', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it('renders labelled charts and a data table fallback', async () => {
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} />);
    expect(
      await screen.findByRole('img', {
        name: 'Bar chart of element counts by Category',
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('list', { name: /Legend/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: 'Doughnut chart of element share by Category',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Data table')).toBeInTheDocument();
  });

  it('switches property from the settings body and collapses', async () => {
    const adapter = await loaded();
    const onCollapsedChange = vi.fn();
    render(
      <>
        <DashboardPanel
          adapter={adapter}
          onCollapsedChange={onCollapsedChange}
        />
        <DashboardSettingsBody />
      </>,
    );
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Category',
    });
    expect(screen.queryByLabelText('Group elements by')).toBeNull();
    fireEvent.change(screen.getByLabelText('Group by'), {
      target: { value: 'Level' },
    });
    expect(
      await screen.findByRole('img', {
        name: 'Bar chart of element counts by Level',
      }),
    ).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Collapse' });
    fireEvent.click(toggle);
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('says so when the saved property is not in the model', async () => {
    window.localStorage.setItem(
      BSH_KEYS.personal.dashboardView,
      JSON.stringify({ property: 'Level' }),
    );
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} propertyNames={['Category']} />);
    expect(
      await screen.findByText(
        'This model has no Level values, so the chart groups by Category.',
      ),
    ).toBeInTheDocument();
  });

  it('honours the controlled collapsed prop', async () => {
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} collapsed />);
    expect(screen.getByRole('button', { name: 'Expand' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});

describe('SummaryTable scroll region', () => {
  const entries = [{ property: 'Category', value: 'Walls', count: 4 }];

  function stubScroll(scrollHeight: number, clientHeight: number) {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      value: scrollHeight,
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      value: clientHeight,
    });
  }

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  });

  it('is not focusable when nothing scrolls', () => {
    stubScroll(100, 100);
    const { container } = render(<SummaryTable entries={entries} />);
    const wrap = container.querySelector('.bsh-table-wrap');
    expect(wrap).not.toHaveAttribute('tabindex');
    expect(wrap).not.toHaveAttribute('aria-label');
  });

  it('is a labelled focusable region when content scrolls', () => {
    stubScroll(300, 100);
    render(<SummaryTable entries={entries} />);
    const region = screen.getByRole('region', {
      name: 'Summary table, scrollable',
    });
    expect(region).toHaveAttribute('tabindex', '0');
  });

  it('gives every cell a title and clamps long values', () => {
    stubScroll(100, 100);
    const { container } = render(<SummaryTable entries={entries} />);
    for (const cell of container.querySelectorAll('tbody td')) {
      expect(cell).toHaveAttribute('title');
      expect(cell.querySelector('.bsh-clamp')).not.toBeNull();
    }
  });
});

describe('Feedback states', () => {
  it('shows skeleton rows while the summary reads properties', async () => {
    const adapter = await loaded();
    vi.spyOn(adapter, 'getLeafProperties').mockReturnValue(
      new Promise(() => undefined),
    );
    const { container } = render(<ModelSummaryPanel adapter={adapter} />);
    expect(container.querySelectorAll('.state-block__bar').length).toBe(5);
  });

  it('maps summary errors to friendly copy with retry and raw detail in a title', async () => {
    const adapter = await loaded();
    const read = vi
      .spyOn(adapter, 'getLeafProperties')
      .mockRejectedValueOnce(new Error('ECONNRESET at 10.0.0.4'));
    render(<ModelSummaryPanel adapter={adapter} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      "We could not read this model's properties",
    );
    expect(alert).not.toHaveTextContent('ECONNRESET');
    expect(alert).toHaveAttribute('title', 'ECONNRESET at 10.0.0.4');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  });

  it('shows the dashboard empty state without a model', () => {
    render(<DashboardPanel />);
    expect(screen.getByText('No charts yet')).toBeInTheDocument();
  });

  it('maps dashboard errors to friendly copy', async () => {
    const adapter = await loaded();
    vi.spyOn(adapter, 'getLeafProperties').mockRejectedValue(
      new Error('boom internals'),
    );
    render(<DashboardPanel adapter={adapter} />);
    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent('boom internals');
    expect(alert).toHaveAttribute('title', 'boom internals');
  });
});

describe('model scope in combined views', () => {
  async function combined(): Promise<MockViewerAdapter> {
    const adapter = new MockViewerAdapter(document.createElement('div'));
    await adapter.loadModels([
      { urn: 'urn-a', name: 'Arch' },
      { urn: 'urn-b', name: 'MEP' },
    ]);
    adapters.push(adapter);
    return adapter;
  }

  function wallsCount(): number {
    const row = screen.getByRole('cell', { name: 'Walls' }).closest('tr');
    return Number(row?.querySelectorAll('td')[2]?.textContent ?? '0');
  }

  it('sums counts over all models and narrows to one model', async () => {
    const adapter = await combined();
    render(
      <ModelSummaryPanel adapter={adapter} propertyNames={['Category']} />,
    );
    await screen.findByRole('cell', { name: 'Walls' });
    const scope = screen.getByRole('combobox', { name: 'Summarize models' });
    expect(
      [...(scope as HTMLSelectElement).options].map((o) => o.textContent),
    ).toEqual(['All models', 'Arch', 'MEP']);
    const all = wallsCount();
    fireEvent.change(scope, { target: { value: 'urn-b' } });
    await waitFor(() => expect(wallsCount()).toBe(all / 2));
    adapter.removeModel('urn-b');
    await waitFor(() =>
      expect(
        screen.queryByRole('combobox', { name: 'Summarize models' }),
      ).toBeNull(),
    );
    await waitFor(() => expect(wallsCount()).toBe(all / 2));
  });

  it('names a model whose properties cannot be read', async () => {
    const adapter = new MockViewerAdapter(document.createElement('div'));
    await adapter.loadModels([
      { urn: 'urn-a', name: 'Arch' },
      { urn: 'urn-noprops', name: 'Broken DB' },
    ]);
    adapters.push(adapter);
    render(
      <ModelSummaryPanel adapter={adapter} propertyNames={['Category']} />,
    );
    expect(
      await screen.findByText(/Properties unavailable for Broken DB/),
    ).toBeInTheDocument();
  });

  it('charts one model in the dashboard', async () => {
    const adapter = await combined();
    render(<DashboardPanel adapter={adapter} />);
    const scope = await screen.findByRole('combobox', { name: 'Chart models' });
    fireEvent.change(scope, { target: { value: 'urn-a' } });
    expect((scope as HTMLSelectElement).value).toBe('urn-a');
  });
});

describe('every model hidden', () => {
  it('explains the empty summary and dashboard', async () => {
    const adapter = new MockViewerAdapter(document.createElement('div'));
    await adapter.loadModels([{ urn: 'urn-a' }, { urn: 'urn-b' }]);
    adapters.push(adapter);
    render(
      <>
        <ModelSummaryPanel adapter={adapter} propertyNames={['Category']} />
        <DashboardPanel adapter={adapter} />
      </>,
    );
    await screen.findAllByRole('cell', { name: 'Walls' });
    act(() => {
      adapter.setModelVisible('urn-a', false);
      adapter.setModelVisible('urn-b', false);
    });
    expect(await screen.findAllByText('All models are hidden')).toHaveLength(2);
    expect(screen.queryAllByRole('cell', { name: 'Walls' })).toHaveLength(0);
    act(() => adapter.setModelVisible('urn-b', true));
    await screen.findAllByRole('cell', { name: 'Walls' });
    expect(screen.queryByText('All models are hidden')).toBeNull();
  });
});

describe('summary view, copy and row actions', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it('filters rows by text and resets', async () => {
    const adapter = await loaded();
    render(
      <ModelSummaryPanel adapter={adapter} propertyNames={['Category']} />,
    );
    await screen.findByRole('cell', { name: 'Walls' });
    fireEvent.change(screen.getByLabelText('Filter summary rows'), {
      target: { value: 'door' },
    });
    expect(screen.queryByRole('cell', { name: 'Walls' })).toBeNull();
    expect(screen.getByRole('cell', { name: 'Doors' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter summary rows'), {
      target: { value: 'zzz' },
    });
    fireEvent.change(screen.getByLabelText('Filter summary rows'), {
      target: { value: '' },
    });
    expect(screen.getByRole('cell', { name: 'Walls' })).toBeInTheDocument();
  });

  it('persists density and hides a column', async () => {
    const adapter = await loaded();
    const { container } = render(
      <>
        <ModelSummaryPanel adapter={adapter} propertyNames={['Category']} />
        <SummarySettingsBody />
      </>,
    );
    await screen.findByRole('cell', { name: 'Walls' });
    fireEvent.change(screen.getByLabelText('Density'), {
      target: { value: 'compact' },
    });
    fireEvent.click(screen.getByLabelText('property'));
    await waitFor(() =>
      expect(container.querySelector('section')).toHaveAttribute(
        'data-density',
        'compact',
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('columnheader', { name: 'Property' }),
      ).toBeNull(),
    );
    expect(
      JSON.parse(window.localStorage.getItem('bsh.summary.view.v1') ?? '{}'),
    ).toMatchObject({ density: 'compact', hiddenColumns: ['property'] });
  });

  it('copies the visible rows as tab separated text', async () => {
    const adapter = await loaded();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(
      <ModelSummaryPanel adapter={adapter} propertyNames={['Category']} />,
    );
    await screen.findByRole('cell', { name: 'Walls' });
    fireEvent.click(screen.getByRole('button', { name: 'Copy table' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0]?.[0]).toMatch(
      /^Property\tValue\tCount\r\nCategory\tWalls\t\d+/,
    );
    vi.unstubAllGlobals();
  });

  it('selects and isolates the elements of a clicked value', async () => {
    const adapter = await loaded();
    render(
      <>
        <ModelSummaryPanel adapter={adapter} propertyNames={['Category']} />
        <SummarySettingsBody />
      </>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Walls' }));
    const walls = adapter.getModelSelection();
    expect(walls.length).toBeGreaterThan(1);
    fireEvent.change(screen.getByLabelText('Row click'), {
      target: { value: 'isolate' },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.click(screen.getByRole('button', { name: 'Doors' }));
    expect(adapter.getIsolated().length).toBeGreaterThan(0);
    expect(adapter.getIsolated().length).not.toBe(walls.length);
    fireEvent.click(screen.getByRole('button', { name: 'Show all elements' }));
    expect(adapter.getIsolated()).toEqual([]);
  });
});

describe('dashboard settings', () => {
  beforeEach(() => {
    installMemoryStorage();
    made.configs.length = 0;
  });

  it('opens from the panel gear button only when handled', () => {
    const onOpenSettings = vi.fn();
    const { unmount } = render(
      <DashboardPanel onOpenSettings={onOpenSettings} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard settings' }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
    unmount();
    render(<DashboardPanel />);
    expect(
      screen.queryByRole('button', { name: 'Dashboard settings' }),
    ).toBeNull();
  });

  it('keeps the pane to charts and a chart type switch', async () => {
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} />);
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Category',
    });
    expect(screen.queryByRole('button', { name: 'Model health' })).toBeNull();
    expect(screen.queryByLabelText('Chart click action')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Doughnut' }));
    expect(
      screen.queryByRole('img', {
        name: 'Bar chart of element counts by Category',
      }),
    ).toBeNull();
    expect(
      screen.getByRole('img', {
        name: 'Doughnut chart of element share by Category',
      }),
    ).toBeInTheDocument();
  });

  it('keeps two bodies and the panel in sync', async () => {
    const adapter = await loaded();
    render(
      <>
        <DashboardPanel adapter={adapter} />
        <DashboardSettingsBody />
        <DashboardSettingsBody />
      </>,
    );
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Category',
    });
    const [first, second] = screen.getAllByLabelText('Chart type');
    fireEvent.change(first as HTMLElement, { target: { value: 'bar' } });
    await waitFor(() =>
      expect((second as HTMLSelectElement).value).toBe('bar'),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('img', {
          name: 'Doughnut chart of element share by Category',
        }),
      ).toBeNull(),
    );
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Model health' })[0] as HTMLElement,
    );
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Level',
    });
  });

  it('limits the categories and resets', async () => {
    render(<DashboardSettingsBody />);
    const max = screen.getByLabelText('Maximum categories');
    fireEvent.change(max, { target: { value: '1' } });
    expect((max as HTMLInputElement).value).toBe('1');
    fireEvent.change(max, { target: { value: '10' } });
    expect((max as HTMLInputElement).value).toBe('10');
    fireEvent.change(max, { target: { value: '' } });
    expect((max as HTMLInputElement).value).toBe('');
    fireEvent.change(max, { target: { value: '99' } });
    fireEvent.keyDown(max, { key: 'Enter' });
    await waitFor(() => expect((max as HTMLInputElement).value).toBe('30'));
    fireEvent.click(screen.getByRole('button', { name: 'Reset dashboard' }));
    await waitFor(() => expect((max as HTMLInputElement).value).toBe('12'));
  });
});

describe('dashboard presets and cross-filter', () => {
  beforeEach(() => {
    installMemoryStorage();
    made.configs.length = 0;
  });

  it('shows one chart per available property of a preset', async () => {
    const adapter = await loaded();
    render(
      <>
        <DashboardPanel adapter={adapter} />
        <DashboardSettingsBody />
      </>,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Model health' }),
    );
    expect(
      await screen.findByRole('img', {
        name: 'Bar chart of element counts by Level',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: 'Bar chart of element counts by Category',
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'By discipline' }));
    await screen.findByRole('button', { name: 'Single chart' });
    expect(
      screen.queryByRole('img', {
        name: 'Bar chart of element counts by Discipline',
      }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Single chart' }));
    expect(
      await screen.findByRole('list', { name: /Legend/ }),
    ).toBeInTheDocument();
  });

  it('selects the elements of a clicked bar', async () => {
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} />);
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Category',
    });
    const config = made.configs.at(-2);
    const index = config?.data.labels.indexOf('Walls') ?? -1;
    expect(index).toBeGreaterThanOrEqual(0);
    act(() => config?.options.onClick({}, [{ index }]));
    expect(adapter.getModelSelection().length).toBeGreaterThan(1);
  });

  it('highlights the buckets of the viewer selection', async () => {
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} />);
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Category',
    });
    const widths = () => made.configs.at(-2)?.data.datasets[0]?.borderWidth;
    expect(widths()?.every((width) => width === 0)).toBe(true);
    const modelId = adapter.getModels()[0]?.id ?? '';
    act(() =>
      adapter.selectModelIds([
        { modelId, dbId: buildMockElements()[0]?.dbId ?? 0 },
      ]),
    );
    await waitFor(() =>
      expect(widths()?.some((width) => width > 0)).toBe(true),
    );
    const walls = made.configs.at(-2)?.data.labels.indexOf('Walls') ?? -1;
    act(() => adapter.clearSelection());
    await waitFor(() =>
      expect(widths()?.every((width) => width === 0)).toBe(true),
    );
    expect(walls).toBeGreaterThanOrEqual(0);
  });
});

describe('summary settings entry points', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it('opens from the panel gear button', () => {
    const onOpenSettings = vi.fn();
    render(<ModelSummaryPanel onOpenSettings={onOpenSettings} />);
    fireEvent.click(screen.getByRole('button', { name: 'Summary settings' }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it('has no gear button without a handler', () => {
    render(<ModelSummaryPanel />);
    expect(
      screen.queryByRole('button', { name: 'Summary settings' }),
    ).toBeNull();
  });

  it('keeps two settings bodies and the panel in sync', async () => {
    const adapter = await loaded();
    const { container } = render(
      <>
        <ModelSummaryPanel adapter={adapter} propertyNames={['Category']} />
        <SummarySettingsBody />
        <SummarySettingsBody />
      </>,
    );
    await screen.findByRole('cell', { name: 'Walls' });
    const [first, second] = screen.getAllByLabelText('Density');
    fireEvent.change(first as HTMLElement, { target: { value: 'compact' } });
    await waitFor(() =>
      expect((second as HTMLSelectElement).value).toBe('compact'),
    );
    expect(container.querySelector('section')).toHaveAttribute(
      'data-density',
      'compact',
    );
  });

  it('resets the view from the settings body', async () => {
    render(<SummarySettingsBody />);
    fireEvent.change(screen.getByLabelText('Density'), {
      target: { value: 'compact' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Density') as HTMLSelectElement).value,
      ).toBe('comfortable'),
    );
  });
});
