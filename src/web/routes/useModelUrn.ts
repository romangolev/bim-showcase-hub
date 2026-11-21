import { useParams, useRouterState } from '@tanstack/react-router';

export function useModelUrn(): string | null {
  const { urn } = useParams({ strict: false }) as { urn?: string };
  const onModel = useRouterState({
    select: (state) => state.location.pathname.startsWith('/model/'),
  });
  return onModel && urn ? urn : null;
}
