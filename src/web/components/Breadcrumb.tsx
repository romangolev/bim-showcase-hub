export interface BreadcrumbProps {
  crumbs: readonly string[];
}

export function Breadcrumb({ crumbs }: BreadcrumbProps) {
  if (crumbs.length === 0) {
    return null;
  }
  const full = crumbs.join(' / ');
  const last = crumbs.length - 1;
  return (
    <nav aria-label={`Breadcrumb: ${full}`} className="crumbs">
      <ol className="crumbs__list">
        {crumbs.flatMap((name, index) => {
          const path = crumbs.slice(0, index + 1).join('/');
          const position =
            index === 0 ? 'first' : index === last ? 'last' : 'middle';
          const item = (
            <li
              key={path}
              className="crumbs__item"
              data-position={position}
              title={name}
            >
              {name}
            </li>
          );
          if (index === 0 && crumbs.length > 2) {
            return [
              item,
              <li
                key="gap"
                className="crumbs__gap"
                title={full}
                aria-hidden="true"
              >
                …
              </li>,
            ];
          }
          return [item];
        })}
      </ol>
    </nav>
  );
}
