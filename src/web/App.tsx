import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { AppCommands } from './commands/AppCommands.js';
import { CommandPalette } from './commands/CommandPalette.js';
import { CatalogUIStrings } from './i18n/CatalogUIStrings.js';
import { ModalProvider } from './modal/index.js';
import { queryClient } from './queryClient.js';
import { router } from './routes/router.js';
import { SettingsProvider } from './settings/index.js';
import { ThemeProvider } from './theme/ThemeContext.js';

export interface AppProps {
  appRouter?: typeof router;
  client?: QueryClient;
}

export function App({ appRouter = router, client = queryClient }: AppProps) {
  return (
    <SettingsProvider>
      <ThemeProvider>
        <CatalogUIStrings>
          <QueryClientProvider client={client}>
            <ModalProvider>
              <RouterProvider router={appRouter} />
              <AppCommands />
              <CommandPalette
                openModel={(urn, context) => {
                  void appRouter.navigate({
                    to: '/model/$urn',
                    params: { urn },
                    search: context,
                  });
                }}
              />
            </ModalProvider>
          </QueryClientProvider>
        </CatalogUIStrings>
      </ThemeProvider>
    </SettingsProvider>
  );
}
