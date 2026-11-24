import { act, fireEvent, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COUNT_COLUMN,
  MAX_SUMMARY_COLUMNS,
  summaryColumn,
} from '../extensions/modelSummary.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import {
  promptSummaryProperty,
  type SummaryPropertyOptions,
} from './SummaryPropertyDialog.js';

const openDialog = () => document.querySelector('dialog[open]') as HTMLElement;

function open(overrides: Partial<SummaryPropertyOptions> = {}) {
  const onSubmit = vi.fn();
  act(() =>
    promptSummaryProperty({
      adapter: null,
      rows: ['Category'],
      columns: [COUNT_COLUMN],
      onSubmit,
      ...overrides,
    }),
  );
  return { onSubmit, box: within(openDialog()) };
}

function pickTyped(box: ReturnType<typeof within>, name: string) {
  fireEvent.change(box.getByLabelText('Search properties'), {
    target: { value: name },
  });
  fireEvent.click(box.getByRole('button', { name: `Use "${name}"` }));
}

async function loaded() {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.load('urn');
  return adapter;
}

beforeEach(() => {
  installMemoryStorage();
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.parentElement?.remove();
  }
});

describe('Add property dialog', () => {
  it('opens on Column with the search focused and adds a typed column', () => {
    const { onSubmit, box } = open();
    expect(box.getByRole('heading', { name: 'Add property' })).toBeVisible();
    expect(box.getByRole('radio', { name: 'Column' })).toBeChecked();
    expect(document.activeElement).toBe(
      box.getByLabelText('Search properties'),
    );
    expect(box.getByText('No model loaded')).toBeInTheDocument();
    pickTyped(box, 'Area');
    fireEvent.change(box.getByLabelText('Aggregate'), {
      target: { value: 'sum' },
    });
    expect(box.getByLabelText('Decimal places')).toBeInTheDocument();
    expect(box.getByLabelText('Unit label')).toBeInTheDocument();
    expect(box.getByLabelText('Title')).toHaveAttribute(
      'placeholder',
      'Sum of Area',
    );
    fireEvent.click(box.getByRole('button', { name: 'Add property' }));
    expect(onSubmit).toHaveBeenCalledWith({
      role: 'column',
      column: summaryColumn('Area', 'sum'),
    });
    expect(document.querySelector('dialog[open]')).toBeNull();
  });

  it('picks a catalog property as Rows and announces the match count', async () => {
    const adapter = await loaded();
    const { onSubmit, box } = open({ adapter });
    fireEvent.click(box.getByRole('radio', { name: 'Rows' }));
    expect(box.queryByLabelText('Aggregate')).toBeNull();
    fireEvent.click(await box.findByRole('radio', { name: 'Level' }));
    expect(box.getByText(/properties match$/)).toHaveAttribute(
      'role',
      'status',
    );
    fireEvent.click(box.getByRole('button', { name: 'Add property' }));
    expect(onSubmit).toHaveBeenCalledWith({ role: 'rows', property: 'Level' });
    adapter.destroy();
  });

  it('says why submit is disabled until a property is chosen', () => {
    const { box } = open();
    const submit = box.getByRole('button', { name: 'Add property' });
    expect(submit).toBeDisabled();
    const reason = box.getByText('Choose a property');
    expect(submit).toHaveAttribute('aria-describedby', reason.id);
  });

  it('blocks a duplicate column and a duplicate row', () => {
    const { box } = open({
      columns: [COUNT_COLUMN, summaryColumn('Area', 'sum')],
    });
    pickTyped(box, 'Area');
    fireEvent.change(box.getByLabelText('Aggregate'), {
      target: { value: 'sum' },
    });
    const submit = box.getByRole('button', { name: 'Add property' });
    expect(submit).toBeDisabled();
    expect(box.getByText('This column already exists')).toBeInTheDocument();
    fireEvent.change(box.getByLabelText('Aggregate'), {
      target: { value: 'avg' },
    });
    expect(submit).toBeEnabled();
    fireEvent.click(box.getByRole('radio', { name: 'Rows' }));
    pickTyped(box, 'Category');
    expect(box.getByText('Already in the rows')).toBeInTheDocument();
    expect(submit).toBeDisabled();
  });

  it('blocks a new column at the cap', () => {
    const full = Array.from({ length: MAX_SUMMARY_COLUMNS }, (_, index) =>
      summaryColumn(`P${index}`, 'count'),
    );
    const { box } = open({ columns: full });
    pickTyped(box, 'Area');
    expect(
      box.getByText('The summary holds up to 12 columns'),
    ).toBeInTheDocument();
  });

  it('prefills an edit, locks the role and saves in place', () => {
    const editing = {
      role: 'column' as const,
      column: summaryColumn('Area', 'sum', { precision: 1 }),
    };
    const { onSubmit, box } = open({
      columns: [COUNT_COLUMN, editing.column],
      editing,
    });
    expect(box.getByRole('heading', { name: 'Edit property' })).toBeVisible();
    expect(box.getByRole('radio', { name: 'Column' })).toBeDisabled();
    expect(box.getByLabelText('Aggregate')).toHaveValue('sum');
    fireEvent.change(box.getByLabelText('Aggregate'), {
      target: { value: 'avg' },
    });
    fireEvent.click(box.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({
      role: 'column',
      column: summaryColumn('Area', 'avg', { precision: 1 }),
    });
  });

  it('keeps decimal places as typed and clamps them on submit', () => {
    const { onSubmit, box } = open();
    pickTyped(box, 'Area');
    fireEvent.change(box.getByLabelText('Aggregate'), {
      target: { value: 'sum' },
    });
    const field = box.getByLabelText('Decimal places');
    fireEvent.change(field, { target: { value: '' } });
    expect(field).toHaveValue(null);
    fireEvent.change(field, { target: { value: '-3' } });
    fireEvent.click(box.getByRole('button', { name: 'Add property' }));
    expect(onSubmit).toHaveBeenCalledWith({
      role: 'column',
      column: summaryColumn('Area', 'sum', { precision: 0 }),
    });
  });

  it('prefills a shortcut property and aggregate', () => {
    const { box } = open({
      initial: { property: 'Mark', aggregate: 'filled' },
    });
    expect(box.getByText('Mark')).toBeInTheDocument();
    expect(box.getByLabelText('Aggregate')).toHaveValue('filled');
    expect(box.getByLabelText('Title')).toHaveAttribute(
      'placeholder',
      'Filled % of Mark',
    );
  });

  it('marks a property this model lacks', async () => {
    const adapter = await loaded();
    const { box } = open({ adapter });
    await box.findByRole('radio', { name: 'Level' });
    pickTyped(box, 'Mark');
    expect(box.getByText('Not in this model')).toBeInTheDocument();
    adapter.destroy();
  });

  it('returns focus to the opener on Escape and on Cancel', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const first = open();
    fireEvent.keyDown(openDialog(), { key: 'Escape' });
    expect(document.querySelector('dialog[open]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(first.onSubmit).not.toHaveBeenCalled();
    const second = open();
    fireEvent.click(second.box.getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
