// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { render } from "preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppUseCases } from "@solid-memo/composition/appUseCases";
import { ErrorGuard } from "@solid-memo/ui/ErrorGuard";
import { loadLocale } from "@solid-memo/ui/i18n";
import { retryable } from "@solid-memo/ui/retryable";
import "@solid-memo/ui/style.css";
import { App } from "./App";
import { siteConfig, siteVersion } from "./config";
import { unregisterJourneysWorkers } from "./journeysWorkers";

// The build's settings (docs/configuration.md), checked as it was built (vite.config.ts).
const config = siteConfig(import.meta.env);

// The site is the folder this page is served from.
const servedSite = new URL(".", document.baseURI).href;

// The old journeys' report's trace viewer, gone but still registered (docs/deployment.md#the-journeys-report).
void unregisterJourneysWorkers(navigator.serviceWorker, servedSite);

const useCases = createAppUseCases({
  // The name the identity provider shows when the user logs in.
  clientName: config.appName,
  servedSite,
  // VITE_LIBRARY_INDEX_URL points a build at another copy of the deck library.
  libraryIndexUrl: config.libraryIndexUrl,
  ruleset: __SHAPES_RULESET__,
  indexedDB: globalThis.indexedDB,
});

// A failed read is tried three times more only when another try may pass, so a checked outcome shows at once (retryable).
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: (count, error) => count < 3 && retryable(error) } },
});

const source = {
  repoUrl: config.repoUrl,
  version: siteVersion(document),
  commitSha: __COMMIT_SHA__,
};

// The language the page speaks, its messages fetched before the first
// render (docs/i18n.md), so it never starts in another; English, at hand
// from the start, waits for nothing. Should they fail, the page speaks English.
await loadLocale(useCases.language(navigator.languages)).catch(() => undefined);

render(
  // An error nothing else caught gets a screen or a notice, never a blank page (docs/privacy.md).
  <ErrorGuard
    source={source}
    appName={config.appName}
    locale={() => useCases.language(navigator.languages)}
  >
    <QueryClientProvider client={queryClient}>
      <App
        useCases={useCases}
        source={source}
        appName={config.appName}
        providers={config.podProviders}
        // The Studio, a chunk of its own, fetched the first time a Studio route opens (docs/studio.md).
        loadStudio={() => import("@solid-memo/studio")}
      />
    </QueryClientProvider>
  </ErrorGuard>,
  document.getElementById("app")!,
);
