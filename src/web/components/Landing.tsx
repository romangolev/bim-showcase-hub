import { useState } from 'react';
import { useSignIn } from '../api/hooks.js';
import type { SummaryEntry } from '../extensions/modelSummary.js';
import { PAINT_PRESETS } from '../extensions/paintBrushes.js';
import { StaticPaintChip } from '../panels/PaintChip.js';
import { SummaryTable } from '../panels/SummaryTable.js';
import { Button, buttonClasses } from '../ui/Button.js';
import { cn } from '../ui/cn.js';
import { iconButtonClasses } from '../ui/IconButton.js';
import { Tab, TabPanel, Tabs, TabsList } from '../ui/Tabs.js';
import { Icon, type IconName } from './icons.js';
import { StateBlock } from './StateBlock.js';
import { TreeRowView } from './tree/TreeRowView.js';

const APS_URL = 'https://aps.autodesk.com';
const REPO_URL = 'https://github.com/romangolev/bim-showcase-hub';

const SAMPLE_ENTRIES: SummaryEntry[] = [
  { property: 'Category', value: 'Walls', count: 412 },
  { property: 'Category', value: 'Windows', count: 188 },
  { property: 'Category', value: 'Doors', count: 96 },
  { property: 'Level', value: 'Level 02', count: 142 },
  { property: 'Level', value: 'Level 03', count: 118 },
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

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Sign-in was cancelled. You can try again when you are ready.',
  invalid_state: 'The sign-in session expired. Start the sign-in again.',
  missing_code: 'Autodesk did not return a sign-in code. Try again.',
  upstream_error: 'Autodesk could not complete the sign-in. Try again.',
};

const GENERIC_AUTH_ERROR = 'Sign-in did not complete. Try again.';

function readAuthError(): string | null {
  const code = new URLSearchParams(window.location.search).get('auth_error');
  if (!code) {
    return null;
  }
  return AUTH_ERROR_MESSAGES[code] ?? GENERIC_AUTH_ERROR;
}

function AuthErrorBanner() {
  const [message, setMessage] = useState(readAuthError);
  if (!message) {
    return null;
  }
  const dismiss = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('auth_error');
    window.history.replaceState(window.history.state, '', url);
    setMessage(null);
  };
  return (
    <div className="landing__auth-error">
      <StateBlock
        variant="error"
        title="Could not sign in"
        message={message}
        action={{ label: 'Dismiss', onClick: dismiss }}
      />
    </div>
  );
}

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
            kind="item"
            name="Tower_Architecture.rvt"
            expandable
            expanded
          />
          <TreeRowView
            level={3}
            kind="version"
            name="v3: 2026-11-10 14:22 by Mara Quinn"
            viewState="ready"
            selected
          />
          <TreeRowView
            level={3}
            kind="version"
            name="v2: 2026-10-02 09:41 by Jonas Reid"
            viewState="ready"
          />
          <TreeRowView
            level={3}
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
        viewState="ready"
        selected
      />
      <TreeRowView
        level={4}
        kind="version"
        name="v2: 2026-10-02 09:41 by Jonas Reid"
        viewState="ready"
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
          className={cn(iconButtonClasses, 'bsh-paint__reset')}
          role="img"
          aria-label="Reset appearance"
          title="Reset appearance"
        >
          <Icon name="refresh" size={16} />
        </span>
        <span className={cn(buttonClasses({}), 'preview__export-button')}>
          <Icon name="table" size={16} />
          Export to Excel
        </span>
      </div>
      <span className="badge">
        <span className="badge__dot" />
        Exported 1,284 elements
      </span>
      <SummaryTable entries={SAMPLE_ENTRIES.slice(0, 5)} />
    </div>
  );
}

function FeatureTabs() {
  const [active, setActive] = useState<FeatureTab['id']>('browse');

  return (
    <Tabs
      className="tabs"
      orientation="vertical"
      value={active}
      onValueChange={(id) => setActive(id as FeatureTab['id'])}
    >
      <TabsList
        aria-label="Product features"
        className="tabs__list"
        activateOnFocus
      >
        {TABS.map((tab) => (
          <Tab key={tab.id} value={tab.id} className="tabs__tab">
            <span className="tabs__tab-title">
              <Icon name={tab.icon} size={16} />
              {tab.title}
            </span>
            <span className="tabs__tab-copy">{tab.copy}</span>
          </Tab>
        ))}
      </TabsList>
      <div className="tabs__stage">
        {TABS.map((tab) => (
          <TabPanel key={tab.id} value={tab.id} keepMounted className="preview">
            {tab.id === 'browse' ? <BrowsePanel /> : null}
            {tab.id === 'inspect' ? <InspectPanel /> : null}
            {tab.id === 'export' ? <ExportPanel /> : null}
          </TabPanel>
        ))}
      </div>
    </Tabs>
  );
}

export function Landing() {
  const signIn = useSignIn();

  return (
    <div className="landing-page">
      <div className="landing">
        <AuthErrorBanner />
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
            <Button
              variant="primary"
              onClick={() => signIn.mutate()}
              disabled={signIn.isPending}
            >
              Sign in with Autodesk
            </Button>
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
