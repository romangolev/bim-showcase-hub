import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listRecentModels,
  PINNED_KEY,
  rememberModel,
} from '../../api/modelStore.js';
import {
  SETTINGS_STORAGE_KEY,
  SettingsProvider,
} from '../../settings/index.js';
import { installMemoryStorage } from '../../test/mockApi.js';
import type { AddTarget } from './DocumentTree.js';
import {
  COLLAPSE_DELAY_MS,
  EXPAND_DELAY_MS,
  MAX_PINS,
  RecentStrip,
  sanitizePins,
} from './RecentStrip.js';
import { LONG_PRESS_MS } from './rowMenu.js';

beforeEach(() => {
  installMemoryStorage();
  rememberModel('urn-a', { file: 'A.rvt', v: '1', crumbs: ['Hub', 'A.rvt'] });
  rememberModel('urn-b', { file: 'B.rvt', v: '2', crumbs: ['Hub', 'B.rvt'] });
});

afterEach(() => {
  window.localStorage.clear();
});

function renderStrip(onOpen = vi.fn()) {
  render(
    <SettingsProvider>
      <RecentStrip onOpen={onOpen} />
    </SettingsProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /^Pinned and Recent/ }));
  return onOpen;
}

describe('RecentStrip', () => {
  it('lists recent models newest first and opens one with its context', () => {
    const onOpen = renderStrip();
    const recent = screen.getByRole('region', { name: 'Recent' });
    const buttons = within(recent).getAllByRole('button', {
      name: /^[AB]\.rvt/,
    });
    expect(buttons.map((b) => b.textContent)).toEqual([
      'B.rvt · 2',
      'A.rvt · 1',
    ]);
    fireEvent.click(buttons[1] as HTMLElement);
    expect(onOpen).toHaveBeenCalledWith(
      'urn-a',
      expect.objectContaining({ file: 'A.rvt', v: '1' }),
    );
  });

  it('pins a model into its own section and persists it', () => {
    renderStrip();
    fireEvent.click(screen.getByRole('button', { name: 'Pin A.rvt · 1' }));
    const pinned = screen.getByRole('region', { name: 'Pinned' });
    expect(within(pinned).getByText('A.rvt · 1')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Recent' })).queryByText(
        'A.rvt · 1',
      ),
    ).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(PINNED_KEY) ?? '[]')).toEqual(
      [expect.objectContaining({ urn: 'urn-a', file: 'A.rvt', v: '1' })],
    );
  });

  it('keeps a pinned model listed when it left the recents', () => {
    window.localStorage.setItem(PINNED_KEY, JSON.stringify(['urn-gone']));
    renderStrip();
    expect(
      within(screen.getByRole('region', { name: 'Pinned' })).getAllByRole(
        'button',
      ),
    ).toHaveLength(3);
  });

  it('opens a pin that left the recents with the context stored in the pin', () => {
    window.localStorage.setItem(
      PINNED_KEY,
      JSON.stringify([{ urn: 'urn-gone', file: 'Gone.rvt', v: '3' }]),
    );
    const onOpen = renderStrip();
    fireEvent.click(screen.getByRole('button', { name: 'Gone.rvt · 3' }));
    expect(onOpen).toHaveBeenCalledWith(
      'urn-gone',
      expect.objectContaining({ file: 'Gone.rvt', v: '3' }),
    );
  });

  it('honours the recents length setting', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ recentsLength: 1 }),
    );
    renderStrip();
    expect(
      within(screen.getByRole('region', { name: 'Recent' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(1);
  });

  it('drops junk pins', () => {
    expect(sanitizePins(['a', 'a', 3, '', { urn: 'b', file: 'B' }])).toEqual([
      { urn: 'a' },
      { urn: 'b', file: 'B' },
    ]);
    expect(sanitizePins('x')).toEqual([]);
  });
});

describe('sanitizePins cap', () => {
  it('keeps at most the pin limit', () => {
    const raw = Array.from({ length: MAX_PINS + 10 }, (_, i) => `urn-${i}`);
    const pins = sanitizePins(raw);
    expect(pins).toHaveLength(MAX_PINS);
    expect(pins[0]?.urn).toBe('urn-0');
  });
});

function stripToggle() {
  return screen.getByRole('button', { name: /^Pinned and Recent/ });
}

function strip() {
  return document.querySelector('.recent-strip') as HTMLElement;
}

function panelHidden() {
  return (document.querySelector('.recent-strip__panel') as HTMLElement).hidden;
}

function renderCollapsed(addTarget?: AddTarget | null, onOpenModal = vi.fn()) {
  const onOpen = vi.fn();
  render(
    <SettingsProvider>
      <RecentStrip
        onOpen={onOpen}
        onOpenModal={onOpenModal}
        addTarget={addTarget}
      />
    </SettingsProvider>,
  );
  return { onOpen, onOpenModal };
}

function target(overrides: Partial<AddTarget> = {}): AddTarget {
  return {
    label: 'the open viewer',
    canAdd: () => true,
    has: () => false,
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
}

describe('RecentStrip collapse', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is collapsed by default with a counted header', () => {
    renderCollapsed();
    expect(stripToggle()).toHaveTextContent('Pinned and Recent (2)');
    expect(stripToggle()).toHaveAttribute('aria-expanded', 'false');
    expect(panelHidden()).toBe(true);
  });

  it('expands on mouse hover and collapses after leaving', () => {
    vi.useFakeTimers();
    renderCollapsed();
    fireEvent.pointerEnter(strip(), { pointerType: 'mouse' });
    expect(panelHidden()).toBe(true);
    act(() => {
      vi.advanceTimersByTime(EXPAND_DELAY_MS + 10);
    });
    expect(stripToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(panelHidden()).toBe(false);
    fireEvent.pointerLeave(strip(), { pointerType: 'mouse' });
    expect(panelHidden()).toBe(false);
    act(() => {
      vi.advanceTimersByTime(COLLAPSE_DELAY_MS + 10);
    });
    expect(panelHidden()).toBe(true);
  });

  it('does not expand when the pointer only passes through', () => {
    vi.useFakeTimers();
    renderCollapsed();
    fireEvent.pointerEnter(strip(), { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(EXPAND_DELAY_MS - 100);
    });
    fireEvent.pointerLeave(strip(), { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(EXPAND_DELAY_MS + COLLAPSE_DELAY_MS);
    });
    expect(panelHidden()).toBe(true);
  });

  it('ignores touch hover', () => {
    renderCollapsed();
    fireEvent.pointerEnter(strip(), { pointerType: 'touch' });
    expect(panelHidden()).toBe(true);
  });

  it('expands when focus enters and collapses when it leaves', () => {
    vi.useFakeTimers();
    renderCollapsed();
    fireEvent.focus(stripToggle());
    expect(panelHidden()).toBe(false);
    fireEvent.blur(stripToggle(), { relatedTarget: document.body });
    act(() => {
      vi.advanceTimersByTime(COLLAPSE_DELAY_MS + 10);
    });
    expect(panelHidden()).toBe(true);
  });

  it('toggles from the header button', () => {
    renderCollapsed();
    fireEvent.click(stripToggle());
    expect(stripToggle()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(stripToggle());
    expect(stripToggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the strip open when the header is clicked while hovering', () => {
    vi.useFakeTimers();
    renderCollapsed();
    fireEvent.pointerEnter(strip(), { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(EXPAND_DELAY_MS + 10);
    });
    fireEvent.click(stripToggle());
    fireEvent.pointerLeave(strip(), { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(COLLAPSE_DELAY_MS + 10);
    });
    expect(panelHidden()).toBe(false);
    fireEvent.click(stripToggle());
    expect(panelHidden()).toBe(true);
  });

  it('renders nothing when there is nothing to list', () => {
    window.localStorage.clear();
    renderCollapsed();
    expect(document.querySelector('.recent-strip')).toBeNull();
  });
});

describe('RecentStrip row menu', () => {
  function openMenu(name = 'Actions for B.rvt · 2') {
    fireEvent.click(stripToggle());
    fireEvent.click(screen.getByRole('button', { name }));
    return screen.getByRole('menu');
  }

  it('lists open, modal, add and pin from the kebab button', () => {
    renderCollapsed(target());
    const menu = openMenu();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Open',
      'Open as modal',
      'Add to open model',
      'Pin',
      'Remove from recent',
    ]);
  });

  it('removes an unpinned model from recents and offers nothing for a pinned one', () => {
    renderCollapsed(target());
    fireEvent.click(
      within(openMenu()).getByRole('menuitem', { name: 'Remove from recent' }),
    );
    expect(screen.queryByRole('button', { name: 'B.rvt · 2' })).toBeNull();
    expect(listRecentModels().map((item) => item.urn)).not.toContain('urn-b');
  });

  it('opens the menu with the context menu event at the pointer', () => {
    renderCollapsed(target());
    fireEvent.click(stripToggle());
    const row = screen.getByRole('button', { name: 'B.rvt · 2' });
    fireEvent.contextMenu(row, { clientX: 40, clientY: 50 });
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('opens with Shift+F10 and the ContextMenu key', () => {
    renderCollapsed(target());
    fireEvent.click(stripToggle());
    const row = screen.getByRole('button', { name: 'B.rvt · 2' });
    fireEvent.keyDown(row, { key: 'F10', shiftKey: true });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.keyDown(row, { key: 'ContextMenu' });
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('opens on a long press with touch only', () => {
    vi.useFakeTimers();
    renderCollapsed(target());
    fireEvent.click(stripToggle());
    const row = screen.getByRole('button', { name: 'B.rvt · 2' });
    fireEvent.pointerDown(row, { pointerType: 'touch' });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('moves with arrow keys and returns focus to the row on Escape', () => {
    renderCollapsed(target());
    fireEvent.click(stripToggle());
    const row = screen.getByRole('button', { name: 'B.rvt · 2' });
    row.focus();
    fireEvent.keyDown(row, { key: 'ContextMenu' });
    const menu = screen.getByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(row).toHaveFocus();
  });

  it('places the menu at the anchor', () => {
    renderCollapsed(target());
    fireEvent.click(stripToggle());
    fireEvent.contextMenu(screen.getByRole('button', { name: 'B.rvt · 2' }), {
      clientX: 33,
      clientY: 44,
    });
    const style = screen.getByRole('menu').style;
    expect(style.left).toBe('33px');
    expect(style.top).toBe('44px');
  });

  it('adds through the menu', () => {
    const add = target();
    renderCollapsed(add);
    fireEvent.click(within(openMenu()).getByText('Add to open model'));
    expect(add.onAdd).toHaveBeenCalledWith([
      { urn: 'urn-b', context: expect.objectContaining({ file: 'B.rvt' }) },
    ]);
  });

  it('removes through the menu when the model is already added', () => {
    const added = target({ has: (urn) => urn === 'urn-b' });
    renderCollapsed(added);
    const menu = openMenu();
    expect(within(menu).queryByText('Add to open model')).toBeNull();
    fireEvent.click(within(menu).getByText('Remove from open model'));
    expect(added.onRemove).toHaveBeenCalledWith('urn-b');
  });

  it('disables add at the combined cap with the reason', () => {
    renderCollapsed(target({ canAdd: () => false }));
    const item = within(openMenu()).getByText('Add to open model');
    expect(item).toBeDisabled();
    expect(item).toHaveAttribute('title', 'Combined viewer holds 6 models');
  });

  it('hides the add item without an open viewer', () => {
    renderCollapsed(null);
    expect(within(openMenu()).queryByText('Add to open model')).toBeNull();
  });

  it('opens as modal through the menu', () => {
    const { onOpenModal } = renderCollapsed(target());
    fireEvent.click(within(openMenu()).getByText('Open as modal'));
    expect(onOpenModal).toHaveBeenCalledWith(
      'urn-b',
      expect.objectContaining({ file: 'B.rvt' }),
    );
  });

  it('pins and unpins through the menu', () => {
    renderCollapsed(target());
    fireEvent.click(within(openMenu()).getByText('Pin'));
    expect(JSON.parse(window.localStorage.getItem(PINNED_KEY) ?? '[]')).toEqual(
      [expect.objectContaining({ urn: 'urn-b' })],
    );
  });

  it('shows a remove button on rows already in the viewer', () => {
    const added = target({ has: (urn) => urn === 'urn-b' });
    renderCollapsed(added);
    fireEvent.click(stripToggle());
    const button = screen.getByRole('button', {
      name: 'Remove B.rvt · 2 from the open viewer',
    });
    expect(button).toHaveAttribute('title', 'Remove from the open viewer');
    fireEvent.click(button);
    expect(added.onRemove).toHaveBeenCalledWith('urn-b');
    expect(screen.queryByRole('button', { name: /Remove A\.rvt/ })).toBeNull();
  });
});
