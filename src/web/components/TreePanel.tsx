import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useModelContext } from '../api/useModelContext.js';
import { DocumentTree } from './tree/DocumentTree.js';

export interface TreePanelProps {
  onNavigate?: () => void;
}

export function TreePanel({ onNavigate }: TreePanelProps) {
  const navigate = useNavigate();
  const { urn } = useParams({ strict: false }) as { urn?: string };
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const { trail } = useModelContext(urn, search);

  return (
    <aside id="document-panel" className="tree-panel" aria-label="Documents">
      <div className="tree-panel__head">
        <h2 className="tree-panel__title">Documents</h2>
      </div>
      <DocumentTree
        selectedUrn={urn}
        revealTrail={trail}
        onOpenModel={(next, context) => {
          void navigate({
            to: '/model/$urn',
            params: { urn: next },
            search: context,
          });
          onNavigate?.();
        }}
      />
    </aside>
  );
}
