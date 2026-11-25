import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { createContext, useContext } from 'react';
import { cn } from './cn.js';
import type { CommonProps } from './types.js';

type Orientation = 'horizontal' | 'vertical';

const OrientationContext = createContext<Orientation>('horizontal');

const listOrientations: Record<Orientation, string> = {
  horizontal: 'flex-row',
  vertical: 'flex-col',
};

const tabBase =
  'cursor-pointer font-ui transition-colors motion-reduce:transition-none focus-visible:-outline-offset-2 data-disabled:cursor-not-allowed data-disabled:text-fg-disabled';

const variants = {
  default:
    'flex min-h-hit flex-none items-center gap-2 rounded-item border-0 border-transparent bg-transparent px-2 text-start text-fg-muted not-data-active:not-data-disabled:hover:bg-fill not-data-disabled:hover:text-fg data-active:bg-fill-hover data-active:text-fg',
  outline:
    'min-h-hit min-w-0 max-w-full overflow-hidden rounded-surface border border-line bg-transparent px-2 py-1 text-13 text-ellipsis whitespace-nowrap text-fg-subtle data-active:border-fg-muted data-active:font-label data-active:text-fg-muted',
};

const markers: Record<Orientation, string> = {
  horizontal: 'border-b-2 data-active:border-b-accent-fill',
  vertical: 'border-s-2 data-active:border-s-accent-fill',
};

export type TabsProps = Omit<TabsPrimitive.Root.Props, 'className'> &
  CommonProps;

export function Tabs({
  className,
  effect,
  orientation = 'horizontal',
  ...props
}: TabsProps) {
  return (
    <OrientationContext.Provider value={orientation}>
      <TabsPrimitive.Root
        {...props}
        orientation={orientation}
        data-slot="tabs"
        data-effect={effect}
        className={cn('flex min-w-0', className)}
      />
    </OrientationContext.Provider>
  );
}

export type TabsListProps = Omit<TabsPrimitive.List.Props, 'className'> &
  CommonProps;

export function TabsList({ className, effect, ...props }: TabsListProps) {
  const orientation = useContext(OrientationContext);
  return (
    <TabsPrimitive.List
      {...props}
      data-slot="tabs-list"
      data-effect={effect}
      className={cn(
        'flex min-w-0 gap-1',
        listOrientations[orientation],
        className,
      )}
    />
  );
}

export type TabProps = Omit<TabsPrimitive.Tab.Props, 'className'> &
  CommonProps & { variant?: keyof typeof variants };

export function Tab({
  className,
  effect,
  variant = 'default',
  ...props
}: TabProps) {
  const orientation = useContext(OrientationContext);
  return (
    <TabsPrimitive.Tab
      {...props}
      data-slot="tab"
      data-variant={variant}
      data-effect={effect}
      className={cn(
        tabBase,
        variants[variant],
        variant === 'default' ? markers[orientation] : '',
        className,
      )}
    />
  );
}

export type TabPanelProps = Omit<TabsPrimitive.Panel.Props, 'className'> &
  CommonProps;

export function TabPanel({ className, effect, ...props }: TabPanelProps) {
  return (
    <TabsPrimitive.Panel
      {...props}
      data-slot="tab-panel"
      data-effect={effect}
      className={cn('min-w-0', className)}
    />
  );
}
