import { render } from "preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createUseCases } from "@solid-memo/application/useCases";
import { authFetch } from "@solid-memo/solid/authFetch";
import { createWriteFence } from "@solid-memo/solid/writeFence";
import { createSolidSessionGateway } from "@solid-memo/solid/solidSessionGateway";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidDeckLibrary } from "@solid-memo/solid/solidDeckLibrary";
import { createSolidDeckRepository } from "@solid-memo/solid/solidDeckRepository";
import { createSolidDigestRepository } from "@solid-memo/solid/solidDigestRepository";
import { createSolidAnswerLog } from "@solid-memo/solid/solidAnswerLog";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { createSolidPreferencesRepository } from "@solid-memo/solid/solidPreferencesRepository";
import { createLocalStorageLanguagePreference } from "@solid-memo/browser/localStorageLanguagePreference";
import { createLocalStorageThemePreference } from "@solid-memo/browser/localStorageThemePreference";
import { createLocalStorageUpdateJournal } from "@solid-memo/browser/localStorageUpdateJournal";
import { createIndexedDbResourceStore } from "@solid-memo/browser/indexedDbResourceStore";
import { GUEST_ORIGIN } from "@solid-memo/domain/guest";
import { createLocalGuestPod } from "@solid-memo/solid/localGuestPod";
import { createLocalPod } from "@solid-memo/solid/localPod";
import { createMemoryResourceStore } from "@solid-memo/solid/memoryResourceStore";
import { routedFetch } from "@solid-memo/solid/routedFetch";
import { createSolidInstanceCopier } from "@solid-memo/solid/solidInstanceCopier";
import { createSolidRepairRepository } from "@solid-memo/solid/solidRepairRepository";
import { createSolidReviewStateRepository } from "@solid-memo/solid/solidReviewStateRepository";
import { createSolidStorageGateway } from "@solid-memo/solid/solidStorageGateway";
import { createSolidWebIdDocumentRepository } from "@solid-memo/solid/solidWebIdDocumentRepository";
import { App } from "./ui/App";
import "./style.css";

/**
 * A guest's pod, kept in this browser (docs/guest-mode.md); in memory, for
 * this page only, where the browser keeps no IndexedDB.
 */
const guestStore = globalThis.indexedDB === undefined ? createMemoryResourceStore() : createIndexedDbResourceStore();
const guestFetch = createLocalPod({
  root: GUEST_ORIGIN,
  store: guestStore,
  newEtag: () => `"${crypto.randomUUID()}"`,
});

/**
 * Every pod request goes through the fence, so an instance being updated
 * cannot be written (docs/migrations.md); then to the guest's pod or, as
 * the logged-in user, to any other.
 */
const writeFence = createWriteFence(routedFetch({ origin: GUEST_ORIGIN, local: guestFetch, remote: authFetch }));
const podFetch = writeFence.fetch;

const shapeValidator = createShaclShapeValidator({
  fetch: podFetch,
  shapesFetch: (input, init) => globalThis.fetch(input, init),
  shapesBaseUrl: new URL("shapes/", document.baseURI).href,
});
/** Every write is checked against the shapes before it reaches the pod (docs/validation.md). */
const checkWrite = shapeValidator.checkSubjects;

const useCases = createUseCases({
  sessionGateway: createSolidSessionGateway("Solid Memo"),
  webIdDocumentRepository: createSolidWebIdDocumentRepository({
    fetch: podFetch,
  }),
  storageGateway: createSolidStorageGateway({ fetch: podFetch }),
  instanceRepository: createSolidInstanceRepository({
    fetch: podFetch,
    checkWrite,
    now: () => new Date(),
    randomId: () => crypto.randomUUID(),
  }),
  deckRepository: createSolidDeckRepository({
    fetch: podFetch,
    checkWrite,
    now: () => new Date(),
    randomId: () => crypto.randomUUID(),
  }),
  deckLibrary: createSolidDeckLibrary({
    fetch: (input, init) => globalThis.fetch(input, init),
    // The library is published in the library pod by the decks repository
    // (docs/deck-library.md); VITE_LIBRARY_INDEX_URL points a build at
    // another copy, such as that repository's `npm run serve`.
    indexUrl: import.meta.env.VITE_LIBRARY_INDEX_URL ?? "https://pod.solid-memo.com/library/decks/index.ttl",
  }),
  preferencesRepository: createSolidPreferencesRepository({
    fetch: podFetch,
    checkWrite,
  }),
  reviewStateRepository: createSolidReviewStateRepository({
    fetch: podFetch,
    checkWrite,
  }),
  shapeValidator,
  repairRepository: createSolidRepairRepository({ fetch: podFetch }),
  instanceCopier: createSolidInstanceCopier({ fetch: podFetch }),
  updateJournal: createLocalStorageUpdateJournal(),
  languagePreference: createLocalStorageLanguagePreference(),
  themePreference: createLocalStorageThemePreference(),
  writeFence,
  digestRepository: createSolidDigestRepository({ fetch: podFetch, checkWrite }),
  answerLog: createSolidAnswerLog({ fetch: podFetch, checkWrite }),
  ruleset: __SHAPES_RULESET__,
  guestPod: createLocalGuestPod({ fetch: guestFetch, store: guestStore }),
});

const queryClient = new QueryClient();

render(
  <QueryClientProvider client={queryClient}>
    <App useCases={useCases} />
  </QueryClientProvider>,
  document.getElementById("app")!,
);
