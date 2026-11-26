import { beforeEach, describe, expect, it } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import {
  PANE_APPEARANCE_KEY,
  PANE_TITLE_MAX,
  paneTags,
  readPaneAppearances,
  sanitizePaneAppearances,
  sanitizePaneTitle,
  setPaneColor,
  setPaneTitle,
  withPaneTitles,
} from './paneAppearance.js';

beforeEach(() => {
  installMemoryStorage();
});

describe('pane appearance', () => {
  it('sanitizes titles and colors and drops unknown panels', () => {
    expect(sanitizePaneTitle('  Level   02  ')).toBe('Level 02');
    expect(sanitizePaneTitle('')).toBeUndefined();
    expect(sanitizePaneTitle(42)).toBeUndefined();
    expect(sanitizePaneAppearances(null)).toEqual({});
    expect(
      sanitizePaneAppearances({
        summary: { title: ' Roof ', color: 'green' },
        'chart:1': { color: 'orange' },
        'chart:2': { title: '', color: 'teal' },
        'not-a-pane': { title: 'Nope' },
        'summary:x': { title: 'Nope' },
      }),
    ).toEqual({
      summary: { title: 'Roof', color: 'green' },
      'chart:1': { color: 'orange' },
    });
  });

  it('caps a title and persists it across reads', () => {
    setPaneTitle('summary', 'x'.repeat(PANE_TITLE_MAX + 10));
    expect(readPaneAppearances().summary).toEqual({
      title: 'x'.repeat(PANE_TITLE_MAX),
    });
    expect(window.localStorage.getItem(PANE_APPEARANCE_KEY)).toContain(
      'summary',
    );
  });

  it('keeps titles independent per instance and clears them', () => {
    let appearances = setPaneTitle('chart:1', 'Cost', {});
    appearances = setPaneTitle('chart:2', 'Volume', appearances);
    expect(appearances).toEqual({
      'chart:1': { title: 'Cost' },
      'chart:2': { title: 'Volume' },
    });
    appearances = setPaneTitle('chart:1', null, appearances);
    expect(appearances).toEqual({ 'chart:2': { title: 'Volume' } });
  });

  it('sets and removes a color tag without touching the title', () => {
    let appearances = setPaneTitle('summary', 'Roof', {});
    appearances = setPaneColor('summary', 'blue', appearances);
    expect(paneTags(appearances)).toEqual({ summary: 'blue' });
    appearances = setPaneColor('summary', null, appearances);
    expect(appearances).toEqual({ summary: { title: 'Roof' } });
    expect(paneTags(appearances)).toEqual({});
  });

  it('passes pane tooltips through and falls back to the label', () => {
    const titles = withPaneTitles(
      {
        'viewer:a': {
          label: 'Tower.rvt · v2',
          tooltip: 'Hub / Docs / Tower.rvt · v2\nModels are 1.2 km apart',
        },
        'viewer:b': { label: 'Core.rvt', tooltip: '' },
      },
      {},
    );
    expect(titles['viewer:a']).toEqual({
      label: 'Tower.rvt · v2',
      tooltip: 'Hub / Docs / Tower.rvt · v2\nModels are 1.2 km apart',
    });
    expect(titles['viewer:b']).toEqual({
      label: 'Core.rvt',
      tooltip: 'Core.rvt',
    });
  });

  it('layers custom titles over pane titles and keeps tooltips', () => {
    const titles = withPaneTitles(
      {
        summary: { label: 'Model summary', tooltip: '' },
        'viewer:a': { label: 'Tower', tooltip: 'Tower · v1' },
      },
      {
        summary: { title: 'Roof' },
        'viewer:a': { title: 'Level 02' },
      },
    );
    expect(titles.summary).toEqual({
      label: 'Roof',
      tooltip: 'Model summary',
    });
    expect(titles['viewer:a']).toEqual({
      label: 'Level 02',
      tooltip: 'Tower · v1',
    });
  });
});
