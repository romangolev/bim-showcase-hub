import { beforeEach, describe, expect, it } from 'vitest';
import { COUNT_COLUMN, summaryColumn } from '../extensions/modelSummary.js';
import { PANE_SETTINGS } from '../settings/paneSettings.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { fireEvent, render, screen, waitFor, within } from '../test/render.js';
import { SummarySettingsBody } from './SummarySettings.js';

const columnIds = () =>
  PANE_SETTINGS.summary.view.read().columns.map((column) => column.id);

const listed = (group: string) =>
  within(screen.getByRole('group', { name: group }))
    .getAllByRole('listitem')
    .map((item) => item.querySelector('span')?.firstChild?.textContent);

const dialog = () =>
  within(document.querySelector('dialog[open]') as HTMLElement);

function pickTyped(name: string) {
  fireEvent.change(dialog().getByLabelText('Search properties'), {
    target: { value: name },
  });
  fireEvent.click(dialog().getByRole('button', { name: `Use "${name}"` }));
}

beforeEach(() => {
  installMemoryStorage();
  for (const node of document.querySelectorAll('dialog')) {
    node.parentElement?.remove();
  }
});

describe('summary settings rows and columns', () => {
  it('keeps the title and pivot level of a renamed row', async () => {
    PANE_SETTINGS.summary.view.write({
      ...PANE_SETTINGS.summary.view.read(),
      layout: 'pivot',
      groupBy: ['Name'],
      titles: { Name: 'Nice' },
    });
    render(<SummarySettingsBody />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Name' }));
    pickTyped('Mark');
    fireEvent.click(dialog().getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(PANE_SETTINGS.summary.view.read()).toMatchObject({
        groupBy: ['Mark'],
        titles: { Mark: 'Nice' },
      }),
    );
  });

  it('lists rows and columns in order instead of a checkbox catalog', () => {
    render(<SummarySettingsBody />);
    expect(listed('Rows')).toEqual([
      'Assembly Code',
      'Classification Code',
      'Name',
    ]);
    expect(listed('Columns')).toEqual(['Count']);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('adds a column from the Columns section', async () => {
    render(<SummarySettingsBody />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a column' }));
    expect(dialog().getByRole('radio', { name: 'Column' })).toBeChecked();
    pickTyped('Area');
    fireEvent.change(dialog().getByLabelText('Aggregate'), {
      target: { value: 'sum' },
    });
    fireEvent.click(dialog().getByRole('button', { name: 'Add property' }));
    await waitFor(() => expect(columnIds()).toEqual(['count', 'sum:Area']));
  });

  it('adds a row from the Rows section with Rows preselected', async () => {
    render(<SummarySettingsBody />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a row property' }));
    expect(dialog().getByRole('radio', { name: 'Rows' })).toBeChecked();
    pickTyped('Level');
    fireEvent.click(dialog().getByRole('button', { name: 'Add property' }));
    await waitFor(() =>
      expect(PANE_SETTINGS.summary.properties.read()).toEqual([
        'Assembly Code',
        'Classification Code',
        'Name',
        'Level',
      ]),
    );
  });

  it('moves, removes and restores the element count', async () => {
    PANE_SETTINGS.summary.view.write({
      ...PANE_SETTINGS.summary.view.initial,
      columns: [COUNT_COLUMN, summaryColumn('Area', 'sum')],
    });
    render(<SummarySettingsBody />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Move Sum of Area up' }),
    );
    await waitFor(() => expect(columnIds()).toEqual(['sum:Area', 'count']));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Count' }));
    await waitFor(() => expect(columnIds()).toEqual(['sum:Area']));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Add element count' }),
    );
    await waitFor(() => expect(columnIds()).toEqual(['count', 'sum:Area']));
    expect(screen.queryByRole('button', { name: 'Edit Count' })).toBeNull();
  });

  it('edits a column in place', async () => {
    PANE_SETTINGS.summary.view.write({
      ...PANE_SETTINGS.summary.view.initial,
      columns: [COUNT_COLUMN, summaryColumn('Area', 'sum')],
    });
    render(<SummarySettingsBody />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Sum of Area' }));
    expect(
      dialog().getByRole('heading', { name: 'Edit property' }),
    ).toBeVisible();
    fireEvent.change(dialog().getByLabelText('Aggregate'), {
      target: { value: 'avg' },
    });
    fireEvent.click(dialog().getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(columnIds()).toEqual(['count', 'avg:Area']));
  });

  it('keeps at least one row', async () => {
    render(<SummarySettingsBody />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Name' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Remove Classification Code' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Remove Assembly Code' }),
      ).toBeDisabled(),
    );
  });
});
