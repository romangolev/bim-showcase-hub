import type { ReactNode } from 'react';

export function ItemList({
  label,
  ordered = false,
  children,
}: {
  label?: string;
  ordered?: boolean;
  children: ReactNode;
}) {
  const List = ordered ? 'ol' : 'ul';
  return (
    <List className="item-list" aria-label={label}>
      {children}
    </List>
  );
}

export function ItemRow({ children }: { children: ReactNode }) {
  return <li className="item-list__row">{children}</li>;
}
