// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { render } from "preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppUseCases } from "@solid-memo/composition/appUseCases";
import "@solid-memo/ui/style.css";
import { App } from "./App";
import { siteConfig } from "./config";

// The build's settings (docs/configuration.md), checked as it was built (vite.config.ts).
const config = siteConfig(import.meta.env);

const useCases = createAppUseCases({
  // The name the identity provider shows when the user logs in.
  clientName: config.appName,
  // The site is the folder this page is served from.
  servedSite: new URL(".", document.baseURI).href,
  // VITE_LIBRARY_INDEX_URL points a build at another copy of the deck library.
  libraryIndexUrl: config.libraryIndexUrl,
  ruleset: __SHAPES_RULESET__,
  indexedDB: globalThis.indexedDB,
});

const queryClient = new QueryClient();

render(
  <QueryClientProvider client={queryClient}>
    <App
      useCases={useCases}
      source={{ repoUrl: config.repoUrl, version: __APP_VERSION__, commitSha: __COMMIT_SHA__ }}
      appName={config.appName}
      providers={config.podProviders}
      // The Studio, a chunk of its own, fetched the first time a Studio route opens (docs/studio.md).
      loadStudio={() => import("@solid-memo/studio")}
    />
  </QueryClientProvider>,
  document.getElementById("app")!,
);
