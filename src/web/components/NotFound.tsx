import { useNavigate } from '@tanstack/react-router';
import { StateBlock } from './StateBlock.js';
import { composeTitle, useDocumentTitle } from './useDocumentTitle.js';

export function NotFound() {
  const navigate = useNavigate();
  useDocumentTitle(composeTitle('Not found'));

  return (
    <section className="not-found" aria-labelledby="not-found-title">
      <StateBlock
        variant="empty"
        icon="search"
        title="Page not found"
        titleAs="h1"
        titleId="not-found-title"
        message="This address does not match any page."
        action={{
          label: 'Back to documents',
          primary: true,
          onClick: () => void navigate({ to: '/' }),
        }}
      />
    </section>
  );
}
