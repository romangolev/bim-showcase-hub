import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button.js';

describe('Button', () => {
  it('renders a native button that honours the hit target', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('data-slot', 'button');
    expect(button).toHaveClass('min-h-hit', 'border-line', 'bg-fill');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('data-disabled');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies the variant, the size and a caller class over the defaults', () => {
    render(
      <Button variant="primary" size="small" className="rounded-pill">
        Open
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Open' });
    expect(button).toHaveClass(
      'bg-solid',
      'text-on-solid',
      'text-13',
      'rounded-pill',
    );
    expect(button).toHaveAttribute('data-variant', 'primary');
    expect(button).toHaveAttribute('data-size', 'small');
    expect(button).not.toHaveClass('text-14');
    expect(button).not.toHaveClass('rounded-control');
    expect(button).not.toHaveClass('bg-fill');
  });

  it('writes the tone as data and as a text role', () => {
    render(<Button tone="danger">Delete</Button>);
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toHaveAttribute('data-tone', 'danger');
    expect(button).toHaveClass('not-data-disabled:text-danger');
  });

  it('stays focusable and busy while loading, and blocks activation', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Export
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Export' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('data-loading');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toHaveAttribute('disabled');
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps its slot when a caller passes one, and submits when asked', () => {
    render(
      <Button type="submit" data-slot="other">
        Send
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Send' });
    expect(button).toHaveAttribute('data-slot', 'button');
    expect(button).toHaveAttribute('type', 'submit');
  });

  it('renders another element through render and keeps the button role', () => {
    render(
      <Button nativeButton={false} render={<a href="/docs" />}>
        Docs
      </Button>,
    );
    const link = screen.getByRole('button', { name: 'Docs' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/docs');
    expect(link).toHaveAttribute('data-slot', 'button');
  });
});
