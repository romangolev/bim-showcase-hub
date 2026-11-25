import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '../ui/Empty.js';
import { Icon } from './icons.js';

export function EmptyState() {
  return (
    <Empty className="empty-state" role="region" aria-labelledby="empty-title">
      <EmptyMedia className="icon-tile">
        <Icon name="layers" size={20} />
      </EmptyMedia>
      <EmptyContent>
        <EmptyTitle id="empty-title" render={(props) => <h1 {...props} />}>
          Pick a model to explore
        </EmptyTitle>
        <EmptyDescription>
          Select a model version to open it in the viewer. Its geometry,
          properties and charts open next to Documents.
        </EmptyDescription>
      </EmptyContent>
    </Empty>
  );
}
