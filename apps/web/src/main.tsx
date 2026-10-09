import { render } from "preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppUseCases } from "@solid-memo/composition/appUseCases";
import "@solid-memo/ui/style.css";
import { App } from "./App";

const useCases = createAppUseCases({
  clientName: "Solid Memo",
  // The site is the folder this page is served from.
  servedSite: new URL(".", document.baseURI).href,
  // VITE_LIBRARY_INDEX_URL points a build at another copy of the deck library.
  libraryIndexUrl: import.meta.env.VITE_LIBRARY_INDEX_URL,
  ruleset: __SHAPES_RULESET__,
  indexedDB: globalThis.indexedDB,
});

const queryClient = new QueryClient();

render(
  <QueryClientProvider client={queryClient}>
    <App
      useCases={useCases}
      commitSha={__COMMIT_SHA__}
      // The Studio, a chunk of its own, fetched the first time a Studio route opens (docs/studio.md).
      loadStudio={() => import("@solid-memo/studio")}
    />
  </QueryClientProvider>,
  document.getElementById("app")!,
);
