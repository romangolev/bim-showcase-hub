import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TreeNode } from '../../../shared/types.js';
import { thumbnailPath } from '../../api/client.js';
import { PreviewCard } from './PreviewCard.js';

const node = (extra: Partial<TreeNode> = {}): TreeNode => ({
  id: 'i1',
  kind: 'item',
  name: 'a.rvt',
  hasChildren: true,
  viewable: false,
  tipUrn: 'urn-tip',
  versionNumber: 4,
  modifiedAt: '2026-01-02T10:00:00.000Z',
  modifiedBy: 'Sam',
  size: 2.5 * 1024 * 1024,
  ...extra,
});

const anchor = new DOMRect(10, 10, 200, 30);

describe('PreviewCard', () => {
  it('shows the thumbnail path of the tip with lazy loading', () => {
    render(
      <PreviewCard node={node()} anchor={anchor} showImage onClose={vi.fn()} />,
    );
    const image = screen.getByAltText('Thumbnail of a.rvt');
    expect(image).toHaveAttribute('src', thumbnailPath('urn-tip', 200));
    expect(image).toHaveAttribute('loading', 'lazy');
  });

  it('falls back to the placeholder when the image fails', () => {
    render(
      <PreviewCard node={node()} anchor={anchor} showImage onClose={vi.fn()} />,
    );
    fireEvent.error(screen.getByAltText('Thumbnail of a.rvt'));
    expect(screen.getByText('No thumbnail')).toBeInTheDocument();
    expect(screen.queryByAltText('Thumbnail of a.rvt')).toBeNull();
  });

  it('keeps the metadata without the image', () => {
    render(
      <PreviewCard
        node={node()}
        anchor={anchor}
        showImage={false}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('a.rvt')).toBeInTheDocument();
    expect(screen.getByText('v4')).toBeInTheDocument();
    expect(screen.getByText(/2026-01-02/)).toBeInTheDocument();
    expect(screen.getByText(/Sam/)).toBeInTheDocument();
    expect(screen.getByText(/2.5 MB/)).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <PreviewCard node={node()} anchor={anchor} showImage onClose={onClose} />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('consumes Escape so outer handlers do not see it', () => {
    const outer = vi.fn();
    document.addEventListener('keydown', outer);
    render(
      <PreviewCard node={node()} anchor={anchor} showImage onClose={vi.fn()} />,
    );
    fireEvent.keyDown(document.body, { key: 'Escape' });
    document.removeEventListener('keydown', outer);
    expect(outer).not.toHaveBeenCalled();
  });

  it('asks to restore focus only for Escape', async () => {
    const onClose = vi.fn();
    render(
      <PreviewCard node={node()} anchor={anchor} showImage onClose={onClose} />,
    );
    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    fireEvent.click(document.body);
    await waitFor(() => expect(onClose).toHaveBeenLastCalledWith(false));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenLastCalledWith(true);
  });

  it('renders through the Popover primitive without taking focus', () => {
    const before = document.activeElement;
    render(
      <PreviewCard node={node()} anchor={anchor} showImage onClose={vi.fn()} />,
    );
    const card = screen.getByRole('dialog', { name: 'Preview of a.rvt' });
    expect(card).toHaveAttribute('data-slot', 'popover-popup');
    expect(card).toHaveClass('tree-preview');
    expect(document.activeElement).toBe(before);
  });

  it('marks the latest version and shows its label', () => {
    render(
      <PreviewCard
        node={node({
          kind: 'version',
          name: 'v4: 2026-01-02 10:00 by Sam',
          urn: 'urn-v4',
          tipUrn: undefined,
          latest: true,
          viewState: 'ready',
        })}
        anchor={anchor}
        showImage
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('v4')).toBeInTheDocument();
    expect(screen.getByText('Latest')).toBeInTheDocument();
    expect(
      screen.getByAltText('Thumbnail of v4: 2026-01-02 10:00 by Sam'),
    ).toHaveAttribute('src', thumbnailPath('urn-v4', 200));
  });
});
