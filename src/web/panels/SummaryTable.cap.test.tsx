import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SUMMARY_VIEW,
  summarize,
  summaryColumn,
} from '../extensions/modelSummary.js';
import { ENTRY_CAP, SummaryTable } from './SummaryTable.js';

const calls = vi.hoisted(() => ({ sizes: [] as number[] }));

vi.mock('../extensions/modelSummary.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../extensions/modelSummary.js')>();
  return {
    ...actual,
    cellsByEntry: (...args: Parameters<typeof actual.cellsByEntry>) => {
      calls.sizes.push(args[1].length);
      return actual.cellsByEntry(...args);
    },
  };
});

const rows = Array.from({ length: ENTRY_CAP + 200 }, (_, i) => ({
  dbId: i,
  name: `n${i}`,
  properties: { Name: `v${i}`, Area: `${i} m²` },
}));
const entries = summarize(rows, ['Name']);
const view = {
  ...DEFAULT_SUMMARY_VIEW,
  columns: [summaryColumn('Area', 'sum')],
};

describe('SummaryTable cap before row construction', () => {
  it('builds cells only for the capped flat rows', () => {
    calls.sizes.length = 0;
    render(<SummaryTable entries={entries} rows={rows} view={view} />);
    expect(calls.sizes.length).toBeGreaterThan(0);
    expect(Math.max(...calls.sizes)).toBeLessThanOrEqual(ENTRY_CAP);
  });

  it('builds cells only for the capped grouped block rows', () => {
    calls.sizes.length = 0;
    render(
      <SummaryTable
        entries={entries}
        rows={rows}
        view={{ ...view, layout: 'grouped' }}
      />,
    );
    expect(calls.sizes.length).toBeGreaterThan(0);
    expect(Math.max(...calls.sizes)).toBeLessThanOrEqual(ENTRY_CAP);
  });
});
