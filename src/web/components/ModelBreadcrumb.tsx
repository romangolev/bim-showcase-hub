import { contextOf } from '../api/openModels.js';
import { useOpenModels } from '../api/useOpenModels.js';
import { useT } from '../i18n/i18n.js';
import { usePersisted } from '../storage.js';
import { breadcrumbOf } from './breadcrumb.js';
import { useTreeControl } from './TreeControl.js';
import { TOPBAR_PREFS } from './topbarPrefs.js';

export function ModelBreadcrumb() {
  const state = useOpenModels();
  const [prefs] = usePersisted(TOPBAR_PREFS);
  const tree = useTreeControl();
  const t = useT();
  const urn = state.active;
  if (!urn) return null;
  const context = contextOf(state, urn);
  const crumbs = breadcrumbOf(urn, context, prefs.breadcrumb);
  if (crumbs.length === 0) return null;
  const full = [...(context?.crumbs ?? []), crumbs.at(-1)?.label ?? ''].join(
    ' / ',
  );
  return (
    <nav
      className="topbar__crumbs"
      aria-label={t('topbar.location')}
      title={full}
    >
      <ol>
        {crumbs.map((crumb, index) => (
          <li key={`${index}:${crumb.label}`}>
            {crumb.current ? (
              <span aria-current="page">{crumb.label}</span>
            ) : crumb.label === '…' ? (
              <span aria-hidden="true">…</span>
            ) : (
              <button
                type="button"
                className="topbar__crumb"
                title={`${crumb.label}. ${t('topbar.showInDocuments')}`}
                onClick={() => tree?.reveal()}
              >
                {crumb.label}
              </button>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
