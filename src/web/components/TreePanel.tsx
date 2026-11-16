import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { parseModelContext } from '../api/modelContext.js';
import { DocumentTree } from './tree/DocumentTree.js';

export interface TreePanelProps {
  open: boolean;
  onNavigate?: () => void;
}

export function TreePanel({ open, onNavigate }: TreePanelProps) {
  const navigate = useNavigate();
  const { urn } = useParams({ strict: false }) as { urn?: string };
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const { trail } = parseModelContext(search);

  return (
    <aside
      id="document-panel"
      className="tree-panel"
      aria-label="Documents"
      data-open={open}
      hidden={!open}
    >
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
