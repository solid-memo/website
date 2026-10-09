import { render } from "preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppUseCases } from "@solid-memo/composition/appUseCases";
import { StudioApp } from "./ui/StudioApp";
import "@solid-memo/ui/style.css";

const useCases = createAppUseCases({
  clientName: "Solid Memo Studio",
  // The Studio is served at studio/ of the site (docs/studio.md); the site is the folder above.
  servedSite: new URL("..", document.baseURI).href,
  // VITE_LIBRARY_INDEX_URL points a build at another copy of the deck library.
  libraryIndexUrl: import.meta.env.VITE_LIBRARY_INDEX_URL,
  ruleset: __SHAPES_RULESET__,
  indexedDB: globalThis.indexedDB,
});

const queryClient = new QueryClient();

render(
  <QueryClientProvider client={queryClient}>
    <StudioApp useCases={useCases} commitSha={__COMMIT_SHA__} />
  </QueryClientProvider>,
  document.getElementById("app")!,
);
