import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { queryClient } from './queryClient.js';
import { router } from './routes/router.js';

export interface AppProps {
  appRouter?: typeof router;
  client?: QueryClient;
}

export function App({ appRouter = router, client = queryClient }: AppProps) {
  return (
    <QueryClientProvider client={client}>
      <RouterProvider router={appRouter} />
    </QueryClientProvider>
  );
}
