import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import { DEFAULT_SUMMARY_VIEW } from '../extensions/modelSummary.js';
import { MockViewerAdapter } from './MockViewerAdapter.js';
import {
  blobToDataUrl,
  buildReportContent,
  collectReport,
  openReportWindow,
  printReport,
  REPORT_MAX_CHARTS,
  REPORT_MAX_PROPERTIES,
  REPORT_VALUES_PER_PROPERTY,
  reportHtml,
} from './report.js';

const DATE = new Date(2026, 10, 19);

function row(dbId: number, properties: Record<string, string>): PropertyRow {
  return { dbId, name: `Element ${dbId}`, properties };
}

const ROWS: PropertyRow[] = [
  row(1, { Category: 'Walls', Level: 'L1' }),
  row(2, { Category: 'Walls', Level: 'L1' }),
  row(3, { Category: 'Doors', Level: 'L2' }),
];

const request = {
  title: 'Tower',
  version: 'v3',
  names: ['Category', 'Level'],
  chartProperties: ['Level'],
  maxCategories: 6,
  now: DATE,
};

describe('report content', () => {
  it('summarizes the properties and charts of the rows', () => {
    const content = buildReportContent(ROWS, {
      ...request,
      names: ['Category'],
    });
    expect(content.elements).toBe(3);
    expect(content.sections.map((section) => section.property)).toEqual([
      'Category',
    ]);
    expect(content.sections[0]?.entries).toEqual([
      { property: 'Category', value: 'Walls', count: 2 },
      { property: 'Category', value: 'Doors', count: 1 },
    ]);
    expect(content.charts).toEqual([
      {
        property: 'Level',
        total: 3,
        data: [
          { label: 'L1', count: 2 },
          { label: 'L2', count: 1 },
        ],
      },
    ]);
  });

  it('keeps the report to a printable size', () => {
    const values = Array.from({ length: 20 }, (_, i) => `Value ${i}`);
    const rows = values.map((value, i) => row(i, { Category: value }));
    const content = buildReportContent(rows, {
      ...request,
      names: [
        'Category',
        ...Array.from({ length: 9 }, (_, i) => `Property ${i}`),
      ],
      chartProperties: Array.from({ length: 5 }, (_, i) => `Level ${i}`),
    });
    expect(content.sections).toHaveLength(REPORT_MAX_PROPERTIES);
    expect(content.sections[0]?.entries).toHaveLength(
      REPORT_VALUES_PER_PROPERTY,
    );
    expect(content.sections[0]?.more).toBe(20 - REPORT_VALUES_PER_PROPERTY);
    expect(content.charts.length).toBeLessThanOrEqual(REPORT_MAX_CHARTS);
  });

  it('skips a chart with no values', () => {
    const content = buildReportContent([], {
      ...request,
      chartProperties: ['Level'],
    });
    expect(content.charts).toEqual([]);
  });

  it('does not repeat a chart property the summary already lists', () => {
    const content = buildReportContent(ROWS, {
      ...request,
      names: ['Category'],
      chartProperties: ['Category', 'Level'],
    });
    expect(content.sections.map((section) => section.property)).toContain(
      'Category',
    );
    expect(content.charts.map((chart) => chart.property)).toEqual(['Level']);
  });

  it('follows the summary view of the pane', () => {
    const content = buildReportContent(
      [row(1, { Category: 'Walls' }), row(2, {})],
      {
        ...request,
        names: ['Category'],
        chartProperties: [],
        view: { ...DEFAULT_SUMMARY_VIEW, hideEmpty: true },
      },
    );
    expect(content.sections[0]?.entries).toEqual([
      { property: 'Category', value: 'Walls', count: 1 },
    ]);
  });
});

describe('report scope', () => {
  it('collects only the elements of the summary scope', async () => {
    const adapter = new MockViewerAdapter(document.createElement('div'));
    await adapter.loadModels([{ urn: 'urn-a' }]);
    const rows = await adapter.getLeafProperties(['Category']);
    const first = rows[0];
    if (!first) throw new Error('no rows');
    adapter.selectModelIds([{ modelId: 'urn-a', dbId: first.dbId }]);
    const content = await collectReport(adapter, {
      title: 'Tower',
      names: ['Category'],
      chartProperties: [],
      maxCategories: 6,
      elements: 'selected',
    });
    expect(rows.length).toBeGreaterThan(1);
    expect(content.elements).toBe(1);
    expect(
      content.sections
        .flatMap((section) => section.entries)
        .reduce((total, entry) => total + entry.count, 0),
    ).toBe(1);
    adapter.destroy();
  });
});

describe('report html', () => {
  it('holds the title, version, date, snapshot, counts and charts', () => {
    const html = reportHtml({
      ...buildReportContent(ROWS, { ...request, names: ['Category'] }),
      image: 'data:image/png;base64,AAAA',
    });
    expect(html).toContain('<h1>Tower</h1>');
    expect(html).toContain('v3');
    expect(html).toContain('2026-11-19');
    expect(html).toContain('3 elements');
    expect(html).toContain('<img src="data:image/png;base64,AAAA"');
    expect(html).toContain('<h2>Summary</h2>');
    expect(html).toContain('<td>Walls</td><td class="count">2</td>');
    expect(html).toContain('<h2>Dashboard</h2>');
    expect(html).toContain('<h3>Level</h3>');
    expect(html).toContain('@page');
  });

  it('leaves out the image and the sections it does not have', () => {
    const html = reportHtml(
      buildReportContent([], { ...request, names: [], chartProperties: [] }),
    );
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<h2>Summary</h2>');
    expect(html).not.toContain('<h2>Dashboard</h2>');
  });

  it('escapes model text', () => {
    const html = reportHtml(
      buildReportContent(
        [row(1, { Category: '<script>x&y</script>' })],
        request,
      ),
    );
    expect(html).not.toContain('<script>x&y');
    expect(html).toContain('&lt;script&gt;x&amp;y&lt;/script&gt;');
  });

  it('names the models whose properties are unavailable', () => {
    const content = buildReportContent(ROWS, request);
    const html = reportHtml({ ...content, unavailable: ['Tower<span>'] });
    expect(html).toContain('Properties unavailable for Tower&lt;span&gt;.');
  });
});

describe('printing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  function fakeWindow(
    readyState: DocumentReadyState = 'complete',
    images: { decode: () => Promise<void> }[] = [],
  ) {
    const write = vi.fn();
    const print = vi.fn();
    const listeners: (() => void)[] = [];
    const win = {
      document: {
        readyState,
        images,
        open: vi.fn(),
        write,
        close: vi.fn(),
      },
      print,
      addEventListener: vi.fn((type: string, run: () => void) => {
        if (type === 'load') listeners.push(run);
      }),
    };
    return { win: win as unknown as Window, write, print, listeners };
  }

  it('writes the report and prints a loaded document', () => {
    const { win, write, print } = fakeWindow();
    expect(printReport('<html></html>', () => win)).toBe(true);
    expect(write).toHaveBeenCalledWith('<html></html>');
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('waits for the document to load before printing', () => {
    const { win, print, listeners } = fakeWindow('loading');
    printReport('<html></html>', () => win);
    expect(print).not.toHaveBeenCalled();
    listeners[0]?.();
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('waits for the report images to decode before printing', async () => {
    let finish: () => void = () => {};
    const decode = () => new Promise<void>((resolve) => (finish = resolve));
    const { win, print } = fakeWindow('complete', [{ decode }]);
    printReport('<html></html>', () => win);
    await Promise.resolve();
    expect(print).not.toHaveBeenCalled();
    finish();
    await vi.waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  });

  it('prints anyway when an image fails to decode', async () => {
    const decode = () => Promise.reject(new Error('broken'));
    const { win, print } = fakeWindow('complete', [{ decode }]);
    printReport('<html></html>', () => win);
    await vi.waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  });

  it('prints when an image never settles', async () => {
    vi.useFakeTimers();
    try {
      const decode = () => new Promise<void>(() => {});
      const { win, print } = fakeWindow('complete', [{ decode }]);
      printReport('<html></html>', () => win);
      await vi.advanceTimersByTimeAsync(5000);
      expect(print).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a blocked window', () => {
    expect(printReport('<html></html>', () => null)).toBe(false);
  });

  it('opens the window with a waiting page before the data is ready', () => {
    const { win, write } = fakeWindow();
    vi.spyOn(window, 'open').mockReturnValue(win);
    expect(openReportWindow()).toBe(win);
    expect(String(write.mock.calls[0]?.[0])).toContain('Preparing the report');
    vi.restoreAllMocks();
    vi.spyOn(window, 'open').mockReturnValue(null);
    expect(openReportWindow()).toBeNull();
  });
});

describe('blobToDataUrl', () => {
  it('reads a snapshot into a data URL', async () => {
    const url = await blobToDataUrl(new Blob(['png'], { type: 'image/png' }));
    expect(url).toBe('data:image/png;base64,cG5n');
  });
});
