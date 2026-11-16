import { type KeyboardEvent, useId, useRef, useState } from 'react';
import { useSignIn } from '../api/hooks.js';
import type { SummaryEntry } from '../extensions/modelSummary.js';
import { PAINT_PRESETS } from '../extensions/paintBrushes.js';
import { StaticPaintChip } from '../panels/PaintChip.js';
import { SummaryTable } from '../panels/SummaryTable.js';
import { Icon, type IconName } from './icons.js';
import { TreeRowView } from './tree/TreeRowView.js';

const APS_URL = 'https://aps.autodesk.com';
const REPO_URL = 'https://github.com/romangolev/bim-showcase-hub';

const SAMPLE_ENTRIES: SummaryEntry[] = [
  { property: 'Category', value: 'Walls', count: 412 },
  { property: 'Category', value: 'Windows', count: 188 },
  { property: 'Category', value: 'Doors', count: 96 },
  { property: 'Level', value: 'Level 02', count: 142 },
  { property: 'Assembly Code', value: 'B2010', count: 87 },
  { property: 'Classification Code', value: 'Uniformat 2.1', count: 64 },
];

const BAR_ROWS = [
  { label: 'Walls', count: 412, weight: 1 },
  { label: 'Windows', count: 188, weight: 0.62 },
  { label: 'Doors', count: 96, weight: 0.4 },
  { label: 'Floors', count: 34, weight: 0.24 },
];

interface FeatureTab {
  id: 'browse' | 'inspect' | 'export';
  icon: IconName;
  title: string;
  copy: string;
}

const TABS: FeatureTab[] = [
  {
    id: 'browse',
    icon: 'folder',
    title: 'Browse',
    copy: 'Walk hubs, projects, folders and versions in a tree that loads as you open it.',
  },
  {
    id: 'inspect',
    icon: 'chart',
    title: 'Inspect',
    copy: 'See element counts by category, level or code as a table, a bar chart and a donut.',
  },
  {
    id: 'export',
    icon: 'table',
    title: 'Export',
    copy: 'Send the property table to an Excel file, or paint selected elements to mark them.',
  },
];

function FloorPlan() {
  return (
    <svg
      viewBox="0 0 320 200"
      className="mockup__plan"
      role="presentation"
      aria-hidden="true"
    >
      <rect x="40" y="30" width="240" height="140" />
      <path d="M40 90h110M200 90h80M150 30v60M200 90v80" />
      <path d="M96 30v12M232 30v12M96 158v12M262 170v-14" />
      <rect x="60" y="48" width="18" height="18" />
      <rect x="244" y="110" width="18" height="18" />
    </svg>
  );
}

function ProductPreview() {
  return (
    <div className="mockup" aria-hidden="true">
      <div className="mockup__body">
        <div className="mockup__tree">
          <TreeRowView
            level={0}
            kind="hub"
            name="Studio hub"
            expandable
            expanded
          />
          <TreeRowView
            level={1}
            kind="project"
            name="Riverside Tower"
            expandable
            expanded
          />
          <TreeRowView
            level={2}
            kind="folder"
            name="Project Files"
            expandable
            expanded
          />
          <TreeRowView
            level={3}
            kind="item"
            name="Tower_Architecture.rvt"
            expandable
            expanded
          />
          <TreeRowView
            level={4}
            kind="version"
            name="v3: 2026-11-10 14:22 by Mara Quinn"
            viewable
            selected
          />
          <TreeRowView
            level={4}
            kind="version"
            name="v2: 2026-10-02 09:41 by Jonas Reid"
            viewable
          />
          <TreeRowView
            level={4}
            kind="version"
            name="v1: 2026-09-14 16:05 by Mara Quinn"
          />
        </div>
        <div className="mockup__viewer">
          <FloorPlan />
        </div>
        <div className="mockup__summary">
          <SummaryTable entries={SAMPLE_ENTRIES.slice(0, 4)} decorative />
        </div>
      </div>
    </div>
  );
}

function BrowsePanel() {
  return (
    <div className="preview__tree">
      <TreeRowView level={0} kind="hub" name="Studio hub" expandable expanded />
      <TreeRowView
        level={1}
        kind="project"
        name="Riverside Tower"
        expandable
        expanded
      />
      <TreeRowView
        level={2}
        kind="folder"
        name="Architecture"
        expandable
        expanded
      />
      <TreeRowView
        level={3}
        kind="item"
        name="Tower_Architecture.rvt"
        expandable
        expanded
      />
      <TreeRowView
        level={4}
        kind="version"
        name="v3: 2026-11-10 14:22 by Mara Quinn"
        viewable
        selected
      />
      <TreeRowView
        level={4}
        kind="version"
        name="v2: 2026-10-02 09:41 by Jonas Reid"
        viewable
      />
      <TreeRowView
        level={4}
        kind="version"
        name="v1: 2026-09-14 16:05 by Mara Quinn"
      />
      <TreeRowView
        level={3}
        kind="item"
        name="Tower_Structure.rvt"
        expandable
      />
    </div>
  );
}

function InspectPanel() {
  return (
    <div className="preview__split">
      <SummaryTable entries={SAMPLE_ENTRIES} />
      <figure className="preview__bars">
        <figcaption>Elements by category</figcaption>
        <ul>
          {BAR_ROWS.map((row, index) => (
            <li key={row.label}>
              <span className="preview__bar-label">{row.label}</span>
              <span className="preview__bar-track">
                <span
                  className="preview__bar-fill"
                  style={{
                    width: `${row.weight * 100}%`,
                    opacity: 1 - index * 0.18,
                  }}
                />
              </span>
              <span className="preview__bar-count">{row.count}</span>
            </li>
          ))}
        </ul>
      </figure>
    </div>
  );
}

function ExportPanel() {
  return (
    <div className="preview__export">
      <div className="preview__toolbar">
        <span className="preview__toolbar-label">Paint selection</span>
        {PAINT_PRESETS.map((preset) => (
          <StaticPaintChip key={preset.id} preset={preset} />
        ))}
        <span
          className="bsh-icon-button bsh-paint__reset"
          role="img"
          aria-label="Reset appearance"
          title="Reset appearance"
        >
          <Icon name="refresh" size={16} />
        </span>
        <span className="bsh-button preview__export-button">
          <Icon name="table" size={16} />
          Export to Excel
        </span>
      </div>
      <span className="badge">
        <span className="badge__dot" />
        Exported 1,284 elements
      </span>
      <SummaryTable entries={SAMPLE_ENTRIES.slice(0, 3)} />
    </div>
  );
}

function FeatureTabs() {
  const baseId = useId();
  const [active, setActive] = useState<FeatureTab['id']>('browse');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const select = (index: number) => {
    const next = TABS[(index + TABS.length) % TABS.length];
    if (!next) {
      return;
    }
    setActive(next.id);
    tabRefs.current[next.id]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        select(index + 1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        select(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        select(0);
        break;
      case 'End':
        event.preventDefault();
        select(TABS.length - 1);
        break;
    }
  };

  return (
    <div className="tabs">
      <div
        role="tablist"
        aria-label="Product features"
        aria-orientation="vertical"
        className="tabs__list"
      >
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            ref={(node) => {
              tabRefs.current[tab.id] = node;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`${baseId}-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            className="tabs__tab"
            onClick={() => setActive(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className="tabs__tab-title">
              <Icon name={tab.icon} size={16} />
              {tab.title}
            </span>
            <span className="tabs__tab-copy">{tab.copy}</span>
          </button>
        ))}
      </div>
      <div className="tabs__stage">
        {TABS.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            id={`${baseId}-panel-${tab.id}`}
            aria-labelledby={`${baseId}-tab-${tab.id}`}
            hidden={active !== tab.id}
            className="preview"
          >
            {tab.id === 'browse' ? <BrowsePanel /> : null}
            {tab.id === 'inspect' ? <InspectPanel /> : null}
            {tab.id === 'export' ? <ExportPanel /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Landing() {
  const signIn = useSignIn();

  return (
    <div className="landing-page">
      <div className="landing">
        <section className="hero" aria-labelledby="hero-title">
          <h1 id="hero-title" className="hero__title">
            Explore your Autodesk models in the browser
          </h1>
          <div className="hero__aside">
            <p className="hero__copy">
              Sign in with your Autodesk account to browse hubs and projects,
              open a model in the viewer, and see its properties as charts and a
              summary.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => signIn.mutate()}
              disabled={signIn.isPending}
            >
              Sign in with Autodesk
            </button>
            {signIn.isError ? (
              <p className="hero__error" role="alert">
                Could not start sign-in. Try again.
              </p>
            ) : null}
          </div>
        </section>
        <section aria-label="Product preview" className="landing__mockup">
          <ProductPreview />
        </section>
        <section aria-labelledby="features-title" className="features">
          <h2 id="features-title" className="features__title">
            From file tree to spreadsheet
          </h2>
          <FeatureTabs />
        </section>
      </div>
      <footer className="landing-footer">
        <div className="landing-footer__inner">
          <div className="landing-footer__about">
            <p className="landing-footer__name">BIM Showcase Hub</p>
            <p className="landing-footer__copy">
              A browser workspace for Autodesk Platform Services models.
            </p>
          </div>
          <nav aria-label="Project links" className="landing-footer__links">
            <a href={APS_URL} target="_blank" rel="noreferrer">
              Autodesk Platform Services
            </a>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub repository
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
