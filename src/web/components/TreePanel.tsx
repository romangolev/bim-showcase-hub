import { useNavigate, useParams } from '@tanstack/react-router';
import { DocumentTree } from './tree/DocumentTree.js';

export function TreePanel({ open }: { open: boolean }) {
  const navigate = useNavigate();
  const { urn } = useParams({ strict: false }) as { urn?: string };

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
        onOpenModel={(next) =>
          void navigate({ to: '/model/$urn', params: { urn: next } })
        }
      />
    </aside>
  );
}
