// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createUseCases, type UseCases } from "@solid-memo/application/useCases";
import { createPodFence } from "@solid-memo/solid/podFence";
import { createWriteFence } from "@solid-memo/solid/writeFence";
import { anonymousFetch } from "@solid-memo/solid/authFetch";
import { createSolidSession } from "@solid-memo/solid/solidSession";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { SHAPES_BASE, SITE, VOCAB_BASE } from "@solid-memo/vocab/ns";
import { createSolidDeckArchive } from "@solid-memo/solid/solidDeckArchive";
import { createSolidDeckLibrary } from "@solid-memo/solid/solidDeckLibrary";
import { createSolidDeckRepository } from "@solid-memo/solid/solidDeckRepository";
import { createSolidDigestRepository } from "@solid-memo/solid/solidDigestRepository";
import { createSolidAnswerLog } from "@solid-memo/solid/solidAnswerLog";
import { createSolidInstanceGraphReader } from "@solid-memo/solid/solidInstanceGraphReader";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { createSolidPaletteRepository } from "@solid-memo/solid/solidPaletteRepository";
import { createSolidPreferencesRepository } from "@solid-memo/solid/solidPreferencesRepository";
import { createSolidReleaseDraftRepository } from "@solid-memo/solid/solidReleaseDraftRepository";
import { createSolidReleasePublisher } from "@solid-memo/solid/solidReleasePublisher";
import { createBrowserFileExchange } from "@solid-memo/browser/fileExchange";
import { createLocalStorageLanguagePreference } from "@solid-memo/browser/localStorageLanguagePreference";
import { createLocalStorageCustomPalettePreference } from "@solid-memo/browser/localStorageCustomPalettePreference";
import { createLocalStoragePalettePreference } from "@solid-memo/browser/localStoragePalettePreference";
import { createLocalStorageSeenHighlights } from "@solid-memo/browser/localStorageSeenHighlights";
import { createLocalStorageTextSizePreference } from "@solid-memo/browser/localStorageTextSizePreference";
import { createLocalStorageThemePreference } from "@solid-memo/browser/localStorageThemePreference";
import { createLocalStorageUpdateJournal } from "@solid-memo/browser/localStorageUpdateJournal";
import { createIndexedDbResourceStore } from "@solid-memo/browser/indexedDbResourceStore";
import { GUEST_ORIGIN } from "@solid-memo/domain/guest";
import { createLocalGuestPod } from "@solid-memo/solid/localGuestPod";
import { createLocalPod } from "@solid-memo/solid/localPod";
import { createMemoryResourceStore } from "@solid-memo/solid/memoryResourceStore";
import { routedFetch } from "@solid-memo/solid/routedFetch";
import { createOwnPodFetch } from "@solid-memo/solid/ownPodFetch";
import { createOwnPodGate } from "@solid-memo/solid/ownPodGate";
import { createSolidInstanceCopier } from "@solid-memo/solid/solidInstanceCopier";
import { createSolidRepairRepository } from "@solid-memo/solid/solidRepairRepository";
import { createSolidReviewStateRepository } from "@solid-memo/solid/solidReviewStateRepository";
import { createSolidStorageGateway } from "@solid-memo/solid/solidStorageGateway";
import { grantPublicRead } from "@solid-memo/solid/client/access";
import { getProfileStorages } from "@solid-memo/solid/client/resources";
import { createSessionClient } from "@solid-memo/solid/client/session";
import { createSolidWebIdDocumentRepository } from "@solid-memo/solid/solidWebIdDocumentRepository";
import { createTrialUseCases } from "./trialUseCases";

/** What an app built on the use cases says of itself and of the page it runs in. */
export interface AppOptions {
  /** The name the app gives itself when the user logs in (docs/authentication.md). */
  clientName: string;
  /** The Client ID Document the build wrote, if any: the client ID on the site it was written for (docs/authentication.md#the-client-id-document). */
  clientId?: string | null;
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
 * cases over them, a Studio trial's sandbox (createTrialUseCases) among
 * them. Each app calls it once, from its src/main.tsx, and hands the
 * result to its components.
 */
export function createAppUseCases({
  clientName,
  clientId,
  servedSite,
  libraryIndexUrl,
  ruleset,
  indexedDB,
}: AppOptions): UseCases {
  /** The logged-in user's session on the sign-in client chosen here, and the fetch that acts as them (docs/authentication.md). */
  const session = createSolidSession(createSessionClient(), {
    clientName,
    site: servedSite,
    clientId,
  });
  /** A guest's pod, kept in this browser (docs/guest-mode.md). */
  const guestStore =
    indexedDB === undefined
      ? createMemoryResourceStore()
      : createIndexedDbResourceStore({ indexedDB });
  const guestFetch = createLocalPod({
    root: GUEST_ORIGIN,
    store: guestStore,
    newEtag: () => `"${crypto.randomUUID()}"`,
  });

  /**
   * Every pod request goes through two fences (docs/boundaries.md): the
   * pod fence, which refuses a write to an address Solid Memo never
   * writes to, an access control's among them (podFence.ts), and the
   * write fence, so a guest's study being moved cannot be written
   * (docs/guest-mode.md); then to the guest's pod or, as the logged-in
   * user, to any other, following no redirect to an address the fences
   * never checked (authFetch.ts).
   */
  const writeFence = createWriteFence(
    routedFetch({ origin: GUEST_ORIGIN, local: guestFetch, remote: session.fetch }),
  );
  const podFetch = createPodFence(writeFence.fetch);
  /** The release publisher's alone, for a release's own access control: the pod fence lets it write a document's ACL or ACR. */
  const shareFetch = createPodFence(writeFence.fetch, { accessControl: true });
  /**
   * The fetch of the adapters that read and write an instance's data,
   * whose catalog may name a deck's documents on any server: behind the
   * pod fence, the credential gate (docs/boundaries.md) sends a request
   * as the user only into the user's own pod (ownFolders) and reads
   * anywhere else as no one, writing nothing there; a guest's pod is
   * this browser's.
   */
  const dataFetch = createPodFence(
    routedFetch({
      origin: GUEST_ORIGIN,
      local: writeFence.fetch,
      remote: createOwnPodGate({
        fetch: writeFence.fetch,
        publicFetch: anonymousFetch,
        webId: session.webId,
        ownFolders,
        revision: () => folderRevision,
      }),
    }),
  );
  const siteFetch = createSiteFetch(servedSite);

  const shapeValidator = createShaclShapeValidator({
    fetch: dataFetch,
    shapesFetch: siteFetch,
    shapesBaseUrl: SHAPES_BASE,
    vocabBaseUrl: VOCAB_BASE,
    vendorBaseUrl: `${servedSite}vendor/`,
  });
  /** Every write is checked against the shapes before it reaches the pod (docs/validation.md). */
  const checkWrite = shapeValidator.checkSubjects;
  const now = () => new Date();
  const randomId = () => crypto.randomUUID();
  const podStorages = createSolidStorageGateway({
    fetch: podFetch,
    profileStorages: getProfileStorages,
  });
  /**
   * The folders the user entered or made on this page: a storage entered
   * by hand (probeStorage), the folder a guest's study is moved into
   * (createContainer), theirs for this page as the storages their profile
   * names are. Each change to the user's folders here moves
   * `folderRevision`, so the credential gate asks for them again.
   */
  const entered = new Set<string>();
  let folderRevision = 0;
  const changed = () => {
    folderRevision++;
  };
  const storageGateway: typeof podStorages = {
    ...podStorages,
    async probeStorage(url) {
      const storage = await podStorages.probeStorage(url);
      entered.add(storage.url);
      changed();
      return storage;
    },
  };
  const podInstances = createSolidInstanceRepository({
    fetch: podFetch,
    dataFetch,
    publicFetch: anonymousFetch,
    checkWrite,
    now,
    randomId,
  });
  const instanceRepository: typeof podInstances = {
    ...podInstances,
    createInstance: (args) => podInstances.createInstance(args).finally(changed),
    attachInstance: (args) => podInstances.attachInstance(args).finally(changed),
    deleteInstance: (args) => podInstances.deleteInstance(args).finally(changed),
  };
  const podCopier = createSolidInstanceCopier({ fetch: podFetch });
  const instanceCopier: typeof podCopier = {
    ...podCopier,
    async createContainer(url) {
      await podCopier.createContainer(url);
      entered.add(url);
      changed();
    },
  };
  /**
   * The folders of the user's own pod: their storages, the instances they
   * registered and the folders they entered or made on this page. With
   * `orNone`, a list that cannot be read names none, the others still
   * counting.
   */
  async function ownFolders(webId: string, orNone = false): Promise<string[]> {
    const settled = <T>(listed: Promise<T[]>) => (orNone ? listed.catch(() => []) : listed);
    const [storages, instances] = await Promise.all([
      settled(storageGateway.discoverStorages(webId)),
      settled(instanceRepository.listInstances(webId)),
    ]);
    return [...[...storages, ...instances].map(({ url }) => url), ...entered];
  }
  /**
   * A release is read where it is published: the site's where the site
   * serves it, a guest's from this browser, one in the user's own pod
   * (their storages, the instances they registered) as the user, since
   * a release the pod would not share is the owner's alone; any other as
   * no one, so the server it names learns nothing of who reads it.
   */
  const releaseFetch = routedFetch({
    origin: SITE,
    local: siteFetch,
    remote: routedFetch({
      origin: GUEST_ORIGIN,
      local: podFetch,
      remote: createOwnPodFetch({
        fetch: podFetch,
        publicFetch: anonymousFetch,
        webId: session.webId,
        // A release in a folder that cannot be found is read as no one.
        ownFolders: (webId) => ownFolders(webId, true),
      }),
    }),
  });

  return createUseCases({
    sessionGateway: session.sessionGateway,
    webIdDocumentRepository: createSolidWebIdDocumentRepository({ fetch: podFetch }),
    storageGateway,
    instanceRepository,
    deckRepository: createSolidDeckRepository({ fetch: dataFetch, checkWrite, now, randomId }),
    deckLibrary: createSolidDeckLibrary({
      fetch: siteFetch,
      // The library is published with the site, from decks/.
      indexUrl: libraryIndexUrl ?? `${SITE}decks/index.ttl`,
      // A release from a link is checked against the library's shapes as it is read, that read alone.
      validate: (url, dataset) => shapeValidator.validateDataset(url, dataset, "library"),
    }),
    preferencesRepository: createSolidPreferencesRepository({ fetch: dataFetch, checkWrite }),
    paletteRepository: createSolidPaletteRepository({ fetch: dataFetch, checkWrite }),
    reviewStateRepository: createSolidReviewStateRepository({ fetch: dataFetch, checkWrite }),
    shapeValidator,
    repairRepository: createSolidRepairRepository({ fetch: dataFetch }),
    instanceCopier,
    updateJournal: createLocalStorageUpdateJournal(),
    languagePreference: createLocalStorageLanguagePreference(),
    themePreference: createLocalStorageThemePreference(),
    palettePreference: createLocalStoragePalettePreference(),
    customPalettePreference: createLocalStorageCustomPalettePreference(),
    textSizePreference: createLocalStorageTextSizePreference(),
    seenHighlights: createLocalStorageSeenHighlights(),
    writeFence,
    digestRepository: createSolidDigestRepository({ fetch: dataFetch, checkWrite }),
    answerLog: createSolidAnswerLog({ fetch: dataFetch, checkWrite }),
    ruleset,
    // Its profile is written through the fences too, as every pod write is.
    guestPod: createLocalGuestPod({ fetch: podFetch, store: guestStore }),
    deckArchive: createSolidDeckArchive({ fetch: dataFetch }),
    fileExchange: createBrowserFileExchange(),
    releaseDraftRepository: createSolidReleaseDraftRepository({
      fetch: dataFetch,
      releaseFetch,
      // What a release names elsewhere is copied into a draft to be published, so it is read as no one.
      publicFetch: routedFetch({ origin: SITE, local: siteFetch, remote: anonymousFetch }),
      checkWrite,
    }),
    // A release is written as the user, its access control too; whether it is public, asked as no one.
    releasePublisher: createSolidReleasePublisher({
      fetch: podFetch,
      shareFetch,
      publicFetch: anonymousFetch,
      grantPublicRead,
    }),
    // A Studio trial plays a draft in a pod of its own, reading the page's pods, never writing them.
    trialSandbox: (draft) =>
      createTrialUseCases(draft, { podFetch: dataFetch, shapeValidator, ruleset }),
    // Read as every pod read is: a guest's from this browser, a document read already with its version.
    instanceGraphReader: createSolidInstanceGraphReader({ fetch: dataFetch }),
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
