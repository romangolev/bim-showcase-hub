import { useSignIn } from '../api/hooks.js';
import { Icon, type IconName } from './icons.js';
import { TreeRowView } from './tree/TreeRowView.js';

const FEATURES: { icon: IconName; title: string; copy: string }[] = [
  {
    icon: 'folder',
    title: 'Browse your hubs',
    copy: 'Walk hubs, projects, folders and versions with a keyboard-friendly tree that loads on demand.',
  },
  {
    icon: 'model',
    title: 'Open any viewable model',
    copy: 'Select a version and the Autodesk Viewer loads it with the model URN ready to copy.',
  },
  {
    icon: 'chart',
    title: 'Read the data behind it',
    copy: 'Charts and a property summary turn a model into numbers you can scan at a glance.',
  },
];

const SUMMARY_ROWS = [
  { label: 'Walls', value: '412' },
  { label: 'Doors', value: '96' },
  { label: 'Windows', value: '188' },
  { label: 'Floors', value: '34' },
];

function Mockup() {
  return (
    <div className="mockup" aria-hidden="true">
      <div className="mockup__chrome">
        <span className="mockup__dot" />
        <span className="mockup__dot" />
        <span className="mockup__dot" />
        <span className="mockup__title">Riverside Tower</span>
      </div>
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
            name="v3: Issued for permit"
            viewable
            selected
          />
          <TreeRowView
            level={4}
            kind="version"
            name="v2: Coordination"
            viewable
          />
          <TreeRowView level={4} kind="version" name="v1: Concept" />
        </div>
        <div className="mockup__viewer">
          <Icon name="model" size={48} />
        </div>
        <div className="mockup__summary">
          <span className="badge">
            <span className="badge__dot" />
            Ready
          </span>
          <table className="mockup__table">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Count</th>
              </tr>
            </thead>
            <tbody>
              {SUMMARY_ROWS.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function Landing() {
  const signIn = useSignIn();

  return (
    <div className="landing">
      <section className="hero" aria-labelledby="hero-title">
        <h1 id="hero-title" className="hero__title">
          Explore your Autodesk models in the browser
        </h1>
        <div className="hero__aside">
          <p className="hero__copy">
            Sign in with your Autodesk account to browse hubs and projects, open
            a model in the viewer, and see its properties as charts and a
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
        <Mockup />
      </section>
      <section aria-labelledby="features-title" className="features">
        <h2 id="features-title" className="features__title">
          One workspace for models and data
        </h2>
        <ul className="features__grid">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="card feature">
              <div className="icon-tile">
                <Icon name={feature.icon} size={18} />
              </div>
              <h3 className="feature__title">{feature.title}</h3>
              <p className="feature__copy">{feature.copy}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
