import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { type LayoutApi, LayoutContext } from './layoutContext.js';
import { defaultModel } from './layoutState.js';
import { WorkspaceSwitcher } from './WorkspaceSwitcher.js';
import { PRESETS, type Workspace, type WorkspaceApi } from './workspaces.js';

const house: Workspace = {
  id: 'ws-1',
  name: 'House',
  layout: defaultModel(),
  appearances: {},
};

function fakeWorkspaces(over: Partial<WorkspaceApi> = {}): WorkspaceApi {
  return {
    presets: PRESETS,
    items: [],
    active: null,
    canRevert: false,
    locked: false,
    canPresent: true,
    dialog: null,
    openDialog: vi.fn(),
    closeDialog: vi.fn(),
    applyPreset: vi.fn(),
    applySaved: vi.fn(),
    save: vi.fn(() => null),
    rename: vi.fn(() => true),
    remove: vi.fn(),
    revert: vi.fn(),
    ...over,
  };
}

function renderSwitcher(
  workspaces: WorkspaceApi,
  layout: Partial<LayoutApi> = {},
) {
  const api = {
    mode: 'dock',
    locked: false,
    canPresent: true,
    workspaces,
    ...layout,
  } as unknown as LayoutApi;
  return render(
    <LayoutContext.Provider value={api}>
      <WorkspaceSwitcher />
    </LayoutContext.Provider>,
  );
}

function openSwitcher() {
  fireEvent.click(screen.getByRole('button', { name: 'Workspaces' }));
  return screen.getByRole('dialog', { name: 'Workspaces' });
}

beforeEach(() => {
  installMemoryStorage();
});

describe('workspace switcher', () => {
  it('lists the built-in presets and applies one', () => {
    const workspaces = fakeWorkspaces();
    renderSwitcher(workspaces);
    const menu = openSwitcher();
    for (const preset of PRESETS) {
      expect(within(menu).getByText(preset.name)).toBeInTheDocument();
    }
    fireEvent.click(within(menu).getByText('Data'));
    expect(workspaces.applyPreset).toHaveBeenCalledWith('data');
    expect(screen.queryByRole('dialog', { name: 'Workspaces' })).toBeNull();
  });

  it('blocks Present without a model but keeps the reason', () => {
    const workspaces = fakeWorkspaces({ canPresent: false });
    renderSwitcher(workspaces);
    const menu = openSwitcher();
    const present = within(menu)
      .getByText('Present')
      .closest('button') as HTMLButtonElement;
    expect(present).toBeDisabled();
    expect(present).toHaveAccessibleDescription('Open a model first');
  });

  it('applies, renames and deletes a saved workspace', () => {
    const workspaces = fakeWorkspaces({ items: [house], active: 'ws-1' });
    renderSwitcher(workspaces);
    const menu = openSwitcher();
    expect(
      within(menu).getByRole('button', { name: 'Apply House' }),
    ).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(menu).getByRole('button', { name: 'Apply House' }));
    expect(workspaces.applySaved).toHaveBeenCalledWith('ws-1');

    const second = openSwitcher();
    fireEvent.click(
      within(second).getByRole('button', { name: 'Rename House' }),
    );
    expect(workspaces.openDialog).toHaveBeenCalledWith({
      kind: 'rename',
      id: 'ws-1',
    });

    const third = openSwitcher();
    fireEvent.click(
      within(third).getByRole('button', { name: 'Delete House' }),
    );
    expect(workspaces.remove).toHaveBeenCalledWith('ws-1');
    expect(screen.queryByRole('dialog', { name: 'Workspaces' })).not.toBeNull();
  });

  it('shows Revert only when there is something to revert', () => {
    const first = fakeWorkspaces();
    const view = renderSwitcher(first);
    const menu = openSwitcher();
    expect(
      within(menu).queryByRole('button', { name: 'Revert layout' }),
    ).toBeNull();
    view.unmount();

    const second = fakeWorkspaces({ canRevert: true });
    renderSwitcher(second);
    const again = openSwitcher();
    fireEvent.click(
      within(again).getByRole('button', { name: 'Revert layout' }),
    );
    expect(second.revert).toHaveBeenCalled();
  });

  it('saves the current arrangement from the dialog', () => {
    const save = vi.fn(() => house);
    const workspaces = fakeWorkspaces({ dialog: { kind: 'save' }, save });
    renderSwitcher(workspaces);
    const field = screen.getByRole('textbox', { name: 'Workspace name' });
    fireEvent.change(field, { target: { value: 'House' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save workspace' }));
    expect(save).toHaveBeenCalledWith('House');
    expect(workspaces.closeDialog).toHaveBeenCalled();
  });

  it('is hidden outside the dock layout', () => {
    renderSwitcher(fakeWorkspaces(), { mode: 'stacked' });
    expect(screen.queryByRole('button', { name: 'Workspaces' })).toBeNull();
  });
});
