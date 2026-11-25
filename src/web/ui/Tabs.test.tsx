import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Tab, TabPanel, Tabs, TabsList } from './Tabs.js';

function Sample({
  orientation,
  onChange = () => undefined,
  variant,
}: {
  orientation?: 'horizontal' | 'vertical';
  onChange?: (value: string) => void;
  variant?: 'default' | 'outline';
}) {
  const [value, setValue] = useState('one');
  return (
    <Tabs
      value={value}
      orientation={orientation}
      onValueChange={(next) => {
        setValue(next as string);
        onChange(next as string);
      }}
    >
      <TabsList aria-label="Sections" activateOnFocus>
        <Tab value="one" variant={variant}>
          One
        </Tab>
        <Tab value="two" variant={variant}>
          Two
        </Tab>
        <Tab value="three" disabled variant={variant}>
          Three
        </Tab>
      </TabsList>
      <TabPanel value="one">First</TabPanel>
      <TabPanel value="two">Second</TabPanel>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('renders a named tablist with one selected tab in the tab order', () => {
    render(<Sample />);
    const list = screen.getByRole('tablist', { name: 'Sections' });
    expect(list).toHaveAttribute('data-slot', 'tabs-list');
    const [one, two] = screen.getAllByRole('tab');
    expect(one).toHaveAttribute('aria-selected', 'true');
    expect(one).toHaveAttribute('data-slot', 'tab');
    expect(one).toHaveAttribute('data-active');
    expect(two).toHaveAttribute('aria-selected', 'false');
    expect(one?.tabIndex).toBe(0);
    expect(two?.tabIndex).toBe(-1);
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('data-slot', 'tab-panel');
    expect(panel).toHaveTextContent('First');
    expect(one).toHaveAttribute('aria-controls', panel.id);
  });

  it('selects on click and shows the matching panel', () => {
    const onChange = vi.fn();
    render(<Sample onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Two' }));
    expect(onChange).toHaveBeenCalledWith('two');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Second');
  });

  it('moves and selects with the arrow keys, focuses a disabled tab without selecting it and wraps', async () => {
    const onChange = vi.fn();
    render(<Sample onChange={onChange} />);
    const [one, two, three] = screen.getAllByRole('tab');
    one?.focus();
    fireEvent.keyDown(one as HTMLElement, { key: 'ArrowRight' });
    await waitFor(() => expect(two).toHaveFocus());
    expect(onChange).toHaveBeenLastCalledWith('two');
    fireEvent.keyDown(two as HTMLElement, { key: 'ArrowRight' });
    await waitFor(() => expect(three).toHaveFocus());
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(three as HTMLElement, { key: 'ArrowRight' });
    await waitFor(() => expect(one).toHaveFocus());
    expect(onChange).toHaveBeenLastCalledWith('one');
  });

  it('uses the vertical arrows and a start marker when vertical', async () => {
    render(<Sample orientation="vertical" />);
    const list = screen.getByRole('tablist');
    expect(list).toHaveAttribute('aria-orientation', 'vertical');
    expect(list).toHaveClass('flex-col');
    const [one, two] = screen.getAllByRole('tab');
    expect(one).toHaveClass('border-s-2');
    one?.focus();
    fireEvent.keyDown(one as HTMLElement, { key: 'ArrowDown' });
    await waitFor(() => expect(two).toHaveFocus());
  });

  it('marks disabled tabs', () => {
    render(<Sample />);
    const three = screen.getByRole('tab', { name: 'Three' });
    expect(three).toHaveAttribute('data-disabled');
  });

  it('styles each variant through data-variant', () => {
    const { unmount } = render(<Sample />);
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute(
      'data-variant',
      'default',
    );
    unmount();
    render(<Sample variant="outline" />);
    const one = screen.getByRole('tab', { name: 'One' });
    expect(one).toHaveAttribute('data-variant', 'outline');
    expect(one).toHaveClass('border-line');
    expect(one).not.toHaveClass('border-b-2');
  });

  it('lets the caller class win', () => {
    render(
      <Tabs defaultValue="a" className="app-tabs">
        <TabsList className="app-list">
          <Tab value="a" className="app-tab">
            A
          </Tab>
        </TabsList>
      </Tabs>,
    );
    expect(document.querySelector('[data-slot="tabs"]')).toHaveClass(
      'app-tabs',
    );
    expect(screen.getByRole('tablist')).toHaveClass('app-list');
    expect(screen.getByRole('tab')).toHaveClass('app-tab');
  });
});
