import { describeModel } from '../api/modelContext.js';
import { Breadcrumb } from '../components/Breadcrumb.js';
import { Icon } from '../components/icons.js';
import { useTreeControl } from '../components/TreeControl.js';
import {
  composeTitle,
  useDocumentTitle,
} from '../components/useDocumentTitle.js';

export function middleEllipsis(value: string, head: number, tail: number) {
  if (value.length <= head + tail + 1) {
    return value;
  }
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

const URN_TAIL = 6;

function MiddleEllipsis({ value }: { value: string }) {
  if (value.length <= URN_TAIL * 2) {
    return <span className="mid">{value}</span>;
  }
  return (
    <span className="mid">
      <span className="mid__head">{value.slice(0, -URN_TAIL)}</span>
      <span className="mid__tail">{value.slice(-URN_TAIL)}</span>
    </span>
  );
}

function UrnControl({ urn }: { urn: string }) {
  return (
    <div className="urn-control">
      <code className="urn-control__value mono" title={urn}>
        <MiddleEllipsis value={urn} />
      </code>
    </div>
  );
}

export interface ModelPageProps {
  urn: string;
  file?: string;
  version?: string;
  crumbs?: readonly string[];
  hasTrail?: boolean;
}

export function ModelPage({
  urn,
  file,
  version,
  crumbs,
  hasTrail = false,
}: ModelPageProps) {
  const treeControl = useTreeControl();

  const identity = describeModel(urn, file, version);
  useDocumentTitle(
    identity.hasFile
      ? composeTitle(identity.title, identity.version)
      : composeTitle('Model', identity.version),
  );

  return (
    <header className="model-head">
      {crumbs && crumbs.length > 0 ? <Breadcrumb crumbs={crumbs} /> : null}
      <div className="model-head__row">
        <h1 className="model-title">
          <span className="model-title__name" title={identity.title}>
            {identity.title}
          </span>
          {identity.version ? (
            <span className="model-tag">{identity.version}</span>
          ) : null}
        </h1>
        <UrnControl urn={urn} />
        {hasTrail ? (
          <button
            type="button"
            className="icon-button model-locate"
            aria-label="Show in documents"
            title="Show in documents"
            onClick={() => treeControl?.reveal()}
          >
            <Icon name="locate" size={16} />
          </button>
        ) : null}
      </div>
      {identity.hasFile || hasTrail ? null : (
        <p className="model-hint">
          <span>
            Open the document panel and pick this model to see its file name and
            location
          </span>
          <button
            type="button"
            className="model-hint__action"
            onClick={() => treeControl?.reveal()}
          >
            Open documents
          </button>
        </p>
      )}
    </header>
  );
}
