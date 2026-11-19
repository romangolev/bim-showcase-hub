import { describe, expect, it } from 'vitest';
import {
  EMPTY_CATALOG,
  matchesPane,
  orderPanes,
  sanitizePaneCatalog,
  withHidden,
  withPin,
} from './paneCatalog.js';
import { PANES, paneById } from './paneRegistry.js';

describe('pane catalog', () => {
  it('sanitizes pins and hidden panes', () => {
    expect(sanitizePaneCatalog(null)).toEqual(EMPTY_CATALOG);
    expect(
      sanitizePaneCatalog({
        pins: ['summary', 'summary', 'nope'],
        hidden: ['chart', 3],
      }),
    ).toEqual({ pins: ['summary'], hidden: ['chart'] });
  });

  it('pins in order and unpins without reordering the rest', () => {
    let catalog = withPin(EMPTY_CATALOG, 'dashboard');
    catalog = withPin(catalog, 'summary');
    expect(catalog.pins).toEqual(['dashboard', 'summary']);
    catalog = withPin(catalog, 'dashboard');
    expect(catalog.pins).toEqual(['summary']);
  });

  it('hiding a pane removes its pin and showing it again is reversible', () => {
    const pinned = withPin(EMPTY_CATALOG, 'summary');
    const hidden = withHidden(pinned, 'summary');
    expect(hidden).toEqual({ pins: [], hidden: ['summary'] });
    expect(withHidden(hidden, 'summary')).toEqual(EMPTY_CATALOG);
  });

  it('matches titles, descriptions, categories and keywords', () => {
    expect(matchesPane(paneById('tree'), 'hub')).toBe(true);
    expect(matchesPane(paneById('tree'), 'HUB projects')).toBe(true);
    expect(matchesPane(paneById('dashboard'), 'graph')).toBe(true);
    expect(matchesPane(paneById('properties'), 'Data')).toBe(true);
    expect(matchesPane(paneById('properties'), 'nope')).toBe(false);
    expect(matchesPane(paneById('properties'), '   ')).toBe(true);
  });

  it('puts pinned panes first, groups the rest by category and obeys hidden', () => {
    const catalog: typeof EMPTY_CATALOG = {
      pins: ['properties'],
      hidden: ['models'],
    };
    const ordered = orderPanes(PANES, catalog, '', false);
    expect(ordered.pinned.map((pane) => pane.id)).toEqual(['properties']);
    expect(ordered.groups.flatMap((group) => group.panes)).not.toContainEqual(
      paneById('properties'),
    );
    expect(ordered.groups.flatMap((group) => group.panes)).not.toContainEqual(
      paneById('models'),
    );
    expect(ordered.groups.map((group) => group.category)).toEqual([
      'Workspace',
      'Viewer',
      'Analysis',
      'Data',
    ]);
    expect(ordered.hidden).toEqual([]);
    expect(orderPanes(PANES, catalog, '', true).hidden).toEqual([
      paneById('models'),
    ]);
  });

  it('searches across hidden panes only when they are shown', () => {
    const catalog: typeof EMPTY_CATALOG = {
      pins: ['summary'],
      hidden: ['models'],
    };
    const searching = orderPanes(PANES, catalog, 'layers', false);
    expect(searching.pinned).toEqual([]);
    expect(searching.groups.flatMap((group) => group.panes)).toEqual([]);
    expect(
      orderPanes(PANES, catalog, 'layers', true).hidden.map((pane) => pane.id),
    ).toEqual(['models']);
  });
});
