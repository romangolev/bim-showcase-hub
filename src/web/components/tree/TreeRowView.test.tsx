import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VIEW_STATES } from '../../../shared/viewState.js';
import { TreeRowView } from './TreeRowView.js';

const NAME = 'v3: 2026-01-01 10:00 by Sam';

describe('TreeRowView', () => {
  it('derives openability from the view state alone', () => {
    for (const state of VIEW_STATES) {
      const { container, unmount } = render(
        <TreeRowView level={3} kind="version" name={NAME} viewState={state} />,
      );
      const row = container.querySelector('.tree-row');
      const openable = state === 'ready' || state === 'unknown';
      expect(row).toHaveAttribute('data-view-state', state);
      expect(row).toHaveAttribute('data-viewable', String(openable));
      expect(row).toHaveAttribute('data-disabled', String(!openable));
      unmount();
    }
  });

  it('treats a version without a state as not translated', () => {
    const { container } = render(
      <TreeRowView level={3} kind="version" name={NAME} />,
    );
    expect(container.querySelector('.tree-row')).toHaveAttribute(
      'data-view-state',
      'not-translated',
    );
    expect(screen.getByText('Not translated')).toBeInTheDocument();
  });

  it('labels an unverified version Unchecked, not Viewable', () => {
    render(
      <TreeRowView level={3} kind="version" name={NAME} viewState="unknown" />,
    );
    const badge = screen.getByText('Unchecked');
    expect(badge.closest('.tree-row__state')).toHaveAttribute(
      'data-state',
      'unchecked',
    );
    expect(badge.closest('.tree-row__state')).toHaveAttribute(
      'title',
      expect.stringContaining(
        'Could not verify that this version has viewable geometry',
      ),
    );
    expect(screen.queryByText('Viewable')).toBeNull();
  });

  it('says a never-checked version is checked on open, not that a check failed', () => {
    const { container } = render(
      <TreeRowView
        level={3}
        kind="version"
        name={NAME}
        viewState="unknown"
        checked={false}
      />,
    );
    const badge = screen.getByText('Unchecked').closest('.tree-row__state');
    expect(badge).toHaveAttribute(
      'title',
      'Not checked yet. It is checked when you open it.',
    );
    const row = container.querySelector('.tree-row') as HTMLElement;
    expect(row.getAttribute('title')).toContain('Not checked yet');
    expect(row.getAttribute('title')).not.toContain('Could not verify');
  });

  it('links the reason to blocked rows through aria-describedby and title', () => {
    const { container } = render(
      <TreeRowView
        level={3}
        kind="version"
        name={NAME}
        viewState="no-geometry"
      />,
    );
    const row = container.querySelector('.tree-row') as HTMLElement;
    const id = row.getAttribute('aria-describedby') as string;
    const reason = container.querySelector(`[id="${id}"]`);
    expect(reason).toHaveClass('visually-hidden');
    expect(reason).toHaveTextContent('publish a 3D view, or re-translate');
    expect(row.getAttribute('title')).toContain(NAME);
    expect(row.getAttribute('title')).toContain('no 3D or 2D view');
  });

  it('does not describe a ready row', () => {
    const { container } = render(
      <TreeRowView level={3} kind="version" name={NAME} viewState="ready" />,
    );
    const row = container.querySelector('.tree-row');
    expect(row).not.toHaveAttribute('aria-describedby');
    expect(row).toHaveAttribute('title', NAME);
  });

  it('renders every badge with the same structure so truncation applies', () => {
    for (const state of VIEW_STATES) {
      const { container, unmount } = render(
        <TreeRowView level={3} kind="version" name={NAME} viewState={state} />,
      );
      const badge = container.querySelector('.tree-row__state');
      expect(badge?.querySelector('.tree-row__state-text')).not.toBeNull();
      unmount();
    }
  });

  it('shows no badge on folders', () => {
    const { container } = render(
      <TreeRowView level={1} kind="folder" name="Files" />,
    );
    expect(container.querySelector('.tree-row__state')).toBeNull();
    expect(container.querySelector('.tree-row')).not.toHaveAttribute(
      'data-view-state',
    );
  });
});
