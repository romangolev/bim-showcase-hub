import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModalProvider } from '../modal/index.js';
import type { ModalDefinition } from '../modal/types.js';
import { tasks } from '../tasks/taskStore.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { CommandPalette } from './CommandPalette.js';
import { readRecents } from './recents.js';
import { COMMANDS } from './registry.js';
import type { Command } from './types.js';

const MODALS: ModalDefinition[] = [
  {
    id: 'demo',
    title: 'Demo window',
    size: 'sm',
    Body: () => <p>Demo body</p>,
  },
];

function setup(commands: Command[]) {
  COMMANDS.register('test', () => commands);
  return render(
    <ModalProvider definitions={MODALS}>
      <button type="button">Opener</button>
      <CommandPalette />
    </ModalProvider>,
  );
}

function press(key: string, init: KeyboardEventInit = {}) {
  fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init });
}

function openPalette() {
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
}

beforeEach(() => {
  installMemoryStorage();
  COMMANDS.register('test', () => []);
});

describe('CommandPalette', () => {
  it('opens with Ctrl+K and Cmd+K as a labelled dialog with a combobox', () => {
    setup([{ id: 'a', title: 'Alpha', group: 'G', run: () => undefined }]);
    expect(screen.queryByRole('combobox')).toBeNull();
    openPalette();
    const box = screen.getByRole('combobox', { name: 'Search commands' });
    expect(box).toHaveFocus();
    expect(document.querySelector('dialog')?.getAttribute('aria-label')).toBe(
      'Command palette',
    );
    expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('filters fuzzily and moves the active descendant with the arrows', () => {
    setup([
      { id: 'a', title: 'Toggle theme', group: 'G', run: () => undefined },
      { id: 'b', title: 'Reset layout', group: 'G', run: () => undefined },
      { id: 'c', title: 'Present', group: 'G', run: () => undefined },
    ]);
    openPalette();
    const box = screen.getByRole('combobox');
    const first = screen.getAllByRole('option')[0];
    expect(box.getAttribute('aria-activedescendant')).toBe(first?.id);
    press('ArrowDown');
    const second = screen.getAllByRole('option')[1];
    expect(box.getAttribute('aria-activedescendant')).toBe(second?.id);
    expect(second).toHaveAttribute('aria-selected', 'true');
    press('ArrowUp');
    press('ArrowUp');
    expect(box.getAttribute('aria-activedescendant')).toBe(
      screen.getAllByRole('option')[2]?.id,
    );
    fireEvent.change(box, { target: { value: 'rslay' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'Reset layout' })).toBeVisible();
  });

  it('runs the active command on Enter, records it and closes', () => {
    const run = vi.fn();
    setup([{ id: 'a', title: 'Alpha', group: 'G', run }]);
    openPalette();
    press('Enter');
    expect(run).toHaveBeenCalledOnce();
    expect(readRecents()).toEqual(['a']);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('shows disabled commands with the reason and does not run them', () => {
    const run = vi.fn();
    setup([
      {
        id: 'x',
        title: 'Export',
        group: 'G',
        disabled: 'Open a model first',
        run,
      },
    ]);
    openPalette();
    const option = screen.getByRole('option', { name: /Export/ });
    expect(option).toHaveAttribute('aria-disabled', 'true');
    expect(option).toHaveTextContent('Open a model first');
    press('Enter');
    fireEvent.click(option);
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('lists recent commands first when the query is empty', () => {
    window.localStorage.setItem('bsh.commands.recent.v1', '["b"]');
    setup([
      { id: 'a', title: 'Alpha', group: 'G', run: () => undefined },
      { id: 'b', title: 'Beta', group: 'G', run: () => undefined },
    ]);
    openPalette();
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveTextContent('Beta');
    expect(screen.getByText('Recent')).toBeInTheDocument();
  });

  it('can open a modal through the host and returns focus on close', () => {
    setup([
      {
        id: 'm',
        title: 'Open demo',
        group: 'G',
        run: (host) => host.openModal('demo'),
      },
    ]);
    const opener = screen.getByRole('button', { name: 'Opener' });
    opener.focus();
    openPalette();
    press('Enter');
    expect(screen.getByText('Demo body')).toBeInTheDocument();
  });

  it('closes on Escape and restores focus to the previous element', () => {
    setup([{ id: 'a', title: 'Alpha', group: 'G', run: () => undefined }]);
    const opener = screen.getByRole('button', { name: 'Opener' });
    opener.focus();
    openPalette();
    expect(screen.getByRole('combobox')).toHaveFocus();
    act(() => {
      document.querySelector('dialog')?.dispatchEvent(new Event('close'));
    });
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('ignores Enter while an IME composition is active', () => {
    const run = vi.fn();
    setup([{ id: 'a', title: 'Alpha', group: 'G', run }]);
    openPalette();
    fireEvent.keyDown(screen.getByRole('combobox'), {
      key: 'Enter',
      isComposing: true,
    });
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('leaves Cmd/Ctrl+K to editable fields outside the palette', () => {
    setup([{ id: 'a', title: 'Alpha', group: 'G', run: () => undefined }]);
    const field = document.createElement('input');
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    document.body.append(field, editor);
    for (const target of [field, editor]) {
      fireEvent.keyDown(target, { key: 'k', ctrlKey: true });
      expect(screen.queryByRole('combobox')).toBeNull();
    }
    field.remove();
    editor.remove();
  });

  it('still closes from its own field with Ctrl+K', () => {
    setup([{ id: 'a', title: 'Alpha', group: 'G', run: () => undefined }]);
    openPalette();
    fireEvent.keyDown(screen.getByRole('combobox'), {
      key: 'k',
      ctrlKey: true,
    });
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('reports a rejected or throwing command as a failed task', async () => {
    tasks.clearFinished();
    setup([
      {
        id: 'r',
        title: 'Rejects',
        group: 'G',
        run: () => Promise.reject(new Error('nope')),
      },
      {
        id: 't',
        title: 'Throws',
        group: 'G',
        run: () => {
          throw new Error('bang');
        },
      },
    ]);
    openPalette();
    press('Enter');
    await waitFor(() =>
      expect(tasks.getSnapshot().tasks.at(-1)).toMatchObject({
        label: 'Rejects',
        state: 'failed',
        detail: 'nope',
      }),
    );
    press('ArrowDown');
    press('Enter');
    expect(tasks.getSnapshot().tasks.at(-1)).toMatchObject({
      label: 'Throws',
      state: 'failed',
      detail: 'bang',
    });
  });

  it('shows an inline alert when a command fails, even with no Task Center', async () => {
    setup([
      {
        id: 'r',
        title: 'Rejects',
        group: 'G',
        run: () => Promise.reject(new Error('nope')),
      },
    ]);
    openPalette();
    press('Enter');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Rejects failed: nope',
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('re-reads enabled state and reasons when the query changes', () => {
    let reason: string | undefined = 'Open a model first';
    COMMANDS.register('test', () => [
      { id: 'a', title: 'Alpha', group: 'G', disabled: reason, run: () => {} },
    ]);
    render(
      <ModalProvider definitions={MODALS}>
        <CommandPalette />
      </ModalProvider>,
    );
    openPalette();
    expect(screen.getByText('Open a model first')).toBeInTheDocument();
    reason = undefined;
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'a' } });
    expect(screen.queryByText('Open a model first')).toBeNull();
    expect(
      screen
        .getByRole('option', { name: 'Alpha' })
        .getAttribute('aria-disabled'),
    ).toBeNull();
  });

  it('keeps focus in the input when a disabled option is pressed', () => {
    setup([
      { id: 'a', title: 'Alpha', group: 'G', disabled: 'No', run: () => {} },
    ]);
    openPalette();
    const option = screen.getByRole('option', { name: /Alpha/ });
    expect(fireEvent.mouseDown(option)).toBe(false);
    fireEvent.click(option);
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('shows group headings only while the query is empty', () => {
    setup([
      { id: 'a', title: 'Alpha one', group: 'G1', run: () => {} },
      { id: 'c', title: 'Alpha three', group: 'G1', run: () => {} },
      { id: 'b', title: 'Alpha two', group: 'G2', run: () => {} },
    ]);
    openPalette();
    const headings = () => document.querySelectorAll('.cmdk__group').length;
    expect(headings()).toBe(2);
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'alpha' },
    });
    expect(headings()).toBe(0);
  });
});
