import { createUseCases, type UseCases } from "@solid-memo/application/useCases";
import { authFetch } from "@solid-memo/solid/authFetch";
import { createWriteFence } from "@solid-memo/solid/writeFence";
import { createSolidSessionGateway } from "@solid-memo/solid/solidSessionGateway";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { SHAPES_BASE, SITE, VOCAB_BASE } from "@solid-memo/vocab/ns";
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

/** What an app built on the use cases says of itself and of the page it runs in. */
export interface AppOptions {
  /** The name the app gives itself when the user logs in (docs/authentication.md). */
  clientName: string;
  /**
   * The address the site is served from, ending in a slash: where the
   * documents it publishes (the shapes, the vocabulary, the deck library
   * and the vendored profiles) are read from.
   */
  servedSite: string;
  /** The deck library's index; the site's own, decks/index.ttl, when unset (docs/deck-library.md). */
  libraryIndexUrl?: string;
  /** A hash of the shapes documents are checked by, which the build computes. */
  ruleset: string;
  /** Where the guest's pod is kept; in memory, for this page only, when the browser keeps no IndexedDB. */
  indexedDB: IDBFactory | undefined;
}

/**
 * Wires the layers together: every adapter behind its port, and the use
 * cases over them. Each app calls it once, from its src/main.tsx, and
 * hands the result to its components.
 */
export function createAppUseCases({ clientName, servedSite, libraryIndexUrl, ruleset, indexedDB }: AppOptions): UseCases {
  /** A guest's pod, kept in this browser (docs/guest-mode.md). */
  const guestStore = indexedDB === undefined ? createMemoryResourceStore() : createIndexedDbResourceStore({ indexedDB });
  const guestFetch = createLocalPod({
    root: GUEST_ORIGIN,
    store: guestStore,
    newEtag: () => `"${crypto.randomUUID()}"`,
  });

  /**
   * Every pod request goes through the fence, so a guest's study being
   * moved cannot be written (docs/guest-mode.md); then to the guest's pod
   * or, as the logged-in user, to any other.
   */
  const writeFence = createWriteFence(routedFetch({ origin: GUEST_ORIGIN, local: guestFetch, remote: authFetch }));
  const podFetch = writeFence.fetch;
  const siteFetch = createSiteFetch(servedSite);

  const shapeValidator = createShaclShapeValidator({
    fetch: podFetch,
    shapesFetch: siteFetch,
    shapesBaseUrl: SHAPES_BASE,
    vocabBaseUrl: VOCAB_BASE,
    vendorBaseUrl: `${servedSite}vendor/`,
  });
  /** Every write is checked against the shapes before it reaches the pod (docs/validation.md). */
  const checkWrite = shapeValidator.checkSubjects;
  const now = () => new Date();
  const randomId = () => crypto.randomUUID();

  return createUseCases({
    sessionGateway: createSolidSessionGateway(clientName),
    webIdDocumentRepository: createSolidWebIdDocumentRepository({ fetch: podFetch }),
    storageGateway: createSolidStorageGateway({ fetch: podFetch }),
    instanceRepository: createSolidInstanceRepository({ fetch: podFetch, checkWrite, now, randomId }),
    deckRepository: createSolidDeckRepository({ fetch: podFetch, checkWrite, now, randomId }),
    deckLibrary: createSolidDeckLibrary({
      fetch: siteFetch,
      // The library is published with the site, from decks/.
      indexUrl: libraryIndexUrl ?? `${SITE}decks/index.ttl`,
    }),
    preferencesRepository: createSolidPreferencesRepository({ fetch: podFetch, checkWrite }),
    reviewStateRepository: createSolidReviewStateRepository({ fetch: podFetch, checkWrite }),
    shapeValidator,
    repairRepository: createSolidRepairRepository({ fetch: podFetch }),
    instanceCopier: createSolidInstanceCopier({ fetch: podFetch }),
    updateJournal: createLocalStorageUpdateJournal(),
    languagePreference: createLocalStorageLanguagePreference(),
    themePreference: createLocalStorageThemePreference(),
    writeFence,
    digestRepository: createSolidDigestRepository({ fetch: podFetch, checkWrite }),
    answerLog: createSolidAnswerLog({ fetch: podFetch, checkWrite }),
    ruleset,
    guestPod: createLocalGuestPod({ fetch: guestFetch, store: guestStore }),
  });
}

/**
 * Reads a document the site publishes (the shapes, the vocabulary, the
 * deck library) from the site the page is served from: the same address
 * in production, the dev or preview server's copy of the repository's
 * otherwise. Its IRIs stay the published ones, which each document
 * states as its @base; any other request is passed on as it is.
 */
export function createSiteFetch(servedSite: string): typeof globalThis.fetch {
  return (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith(SITE)) return globalThis.fetch(input, init);
    const served = `${servedSite}${url.slice(SITE.length)}`;
    // A Request keeps its method and headers at the served address.
    return globalThis.fetch(input instanceof Request ? new Request(served, input) : served, init);
  };
}
