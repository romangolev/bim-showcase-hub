import { useParams, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { useModelContext } from '../api/useModelContext.js';
import { useOpenModels } from '../api/useOpenModels.js';
import { DocumentsHome } from './tree/DocumentsHome.js';
import { DocumentTree } from './tree/DocumentTree.js';
import { DOC_ROOT, type TreeRoot, treeRootOf } from './tree/docRoot.js';
import { HubProjectSwitcher } from './tree/HubProjectSwitcher.js';
import { RecentStrip } from './tree/RecentStrip.js';
import { useModelOpeners } from './tree/useModelOpeners.js';

export interface TreePanelProps {
  onNavigate?: () => void;
}

export function TreePanel({ onNavigate }: TreePanelProps) {
  const { urn } = useParams({ strict: false }) as { urn?: string };
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const { trail } = useModelContext(urn, search);
  const [root, setRoot] = useState<TreeRoot>(() =>
    treeRootOf(DOC_ROOT.read(), undefined, undefined),
  );
  const openers = useModelOpeners(onNavigate);
  const home = useOpenModels().active === null;

  return (
    <aside id="document-panel" className="tree-panel" aria-label="Documents">
      <div className="tree-panel__head">
        <h2 className="tree-panel__title">Documents</h2>
      </div>
      <div className="docs-toolbar">
        <HubProjectSwitcher onChange={setRoot} />
      </div>
      {home ? (
        <DocumentsHome selectedUrn={urn} openers={openers} />
      ) : (
        <RecentStrip
          selectedUrn={urn}
          onOpen={openers.open}
          onOpenModal={openers.openModal}
          addTarget={openers.addTarget}
        />
      )}
      <DocumentTree
        key={`${root.scope.kind}:${root.node.id}`}
        root={root}
        selectedUrn={urn}
        revealTrail={trail}
        pickPreview={openers.preview}
        onOpenModel={openers.open}
        onOpenTabs={openers.openTabs}
        onOpenModal={openers.openModal}
        onOpenTogether={openers.openTogether}
        addTarget={openers.addTarget}
      />
    </aside>
  );
}
