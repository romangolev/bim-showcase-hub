import { Icon } from './icons.js';

export function EmptyState() {
  return (
    <section className="empty-state" aria-labelledby="empty-title">
      <div className="icon-tile">
        <Icon name="layers" size={20} />
      </div>
      <h1 id="empty-title" className="empty-state__title">
        Pick a model to explore
      </h1>
      <p className="empty-state__copy">
        Select a model version to open it in the viewer. Its geometry,
        properties and charts open next to Documents.
      </p>
    </section>
  );
}
