import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { ModalProvider } from './modal/index.js';
import { queryClient } from './queryClient.js';
import { router } from './routes/router.js';
import { ThemeProvider } from './theme/ThemeContext.js';

export interface AppProps {
  appRouter?: typeof router;
  client?: QueryClient;
}

export function App({ appRouter = router, client = queryClient }: AppProps) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <ModalProvider>
          <RouterProvider router={appRouter} />
        </ModalProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
