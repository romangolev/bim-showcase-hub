import type { ReactNode } from 'react';
import { List, ListItem } from '../ui/List.js';

export function ItemList({
  label,
  ordered = false,
  children,
}: {
  label?: string;
  ordered?: boolean;
  children: ReactNode;
}) {
  return (
    <List aria-label={label} render={ordered ? <ol /> : undefined}>
      {children}
    </List>
  );
}

export function ItemRow({ children }: { children: ReactNode }) {
  return <ListItem>{children}</ListItem>;
}
