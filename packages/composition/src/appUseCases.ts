// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ReleaseDraftRepository } from "@solid-memo/application/ports";
import { createUseCases, type UseCases } from "@solid-memo/application/useCases";
import { createPodFence } from "@solid-memo/solid/podFence";
import { createWriteFence } from "@solid-memo/solid/writeFence";
import { anonymousFetch } from "@solid-memo/solid/authFetch";
import { READ_DEADLINE_MS, WHOLE_READ_MS, withReadDeadline } from "@solid-memo/solid/readDeadline";
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
import { createLocalStorageSeenHighlights } from "@solid-memo/browser/localStorageSeenHighlights";
import { createWebStorageDeviceStore } from "@solid-memo/browser/webStorageDeviceStore";
import {
  createLocalStorageSetting,
  PALETTE_KEY,
  TEXT_SIZE_KEY,
  THEME_KEY,
} from "@solid-memo/browser/localStorageSetting";
import { createLocalStorageUpdateJournal } from "@solid-memo/browser/localStorageUpdateJournal";
import { createLogoutChannel } from "@solid-memo/browser/logoutChannel";
import { createIndexedDbResourceStore } from "@solid-memo/browser/indexedDbResourceStore";
import { GUEST_ORIGIN } from "@solid-memo/domain/guest";
import { PALETTE_SETTING } from "@solid-memo/domain/palette";
import { TEXT_SIZE_SETTING } from "@solid-memo/domain/textSize";
import { THEME_SETTING } from "@solid-memo/domain/theme";
import { isInFolder } from "@solid-memo/domain/instanceLayout";
import { createLocalGuestPod } from "@solid-memo/solid/localGuestPod";
import { createLocalPod } from "@solid-memo/solid/localPod";
import { createMemoryResourceStore } from "@solid-memo/solid/memoryResourceStore";
import { routedFetch } from "@solid-memo/solid/routedFetch";
import { createOwnPodFetch } from "@solid-memo/solid/ownPodFetch";
import { createOwnPodGate, type OwnFolders } from "@solid-memo/solid/ownPodGate";
import { createSolidInstanceCopier } from "@solid-memo/solid/solidInstanceCopier";
import { createSolidReviewStateRepository } from "@solid-memo/solid/solidReviewStateRepository";
import { createSolidStorageGateway } from "@solid-memo/solid/solidStorageGateway";
import { grantPublicRead } from "@solid-memo/solid/client/access";
import {
  FOREIGN_LIMITS,
  FOREIGN_READS_BUDGET,
  INSTANCE_READS_TOTAL,
  FOREIGN_REREADS,
  sharedReadBudget,
} from "@solid-memo/solid/client/readLimits";
import { getProfileStorages } from "@solid-memo/solid/client/resources";
import { createSessionClient } from "@solid-memo/solid/client/session";
import { createSolidWebIdDocumentRepository } from "@solid-memo/solid/solidWebIdDocumentRepository";
import { createOffPage, type WorkerLike } from "@solid-memo/solid/offPage";
import { readElsewhere } from "@solid-memo/solid/datasets";
import {
  offPageDeckArchive,
  offPageDocumentReader,
  offPageReleaseDocuments,
  offPageReleaseDrafts,
  offPageShapeValidator,
} from "@solid-memo/solid/offPageAdapters";
import { createTrialUseCases } from "./trialUseCases";
import { spawnOffPageWorker } from "./offPageWorker";

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
  /**
   * Starts a worker that reads documents the app did not write, off the
   * page (offPage.ts); the one the build bundles (offPageWorker.ts)
   * unless given.
   */
  spawnWorker?: () => WorkerLike;
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
  spawnWorker = spawnOffPageWorker,
}: AppOptions): UseCases {
  /** The logged-in user's session on the sign-in client chosen here, and the fetch that acts as them (docs/authentication.md). */
  const session = createSolidSession(createSessionClient(), {
    clientName,
    site: servedSite,
    clientId,
    ownStorages,
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
   * never checked (authFetch.ts). A read of another server that gets no
   * answer in time, or whose body stops coming, is given up, to be tried
   * again (readDeadline.ts); one of the user's own pod may take as long
   * in all as its body keeps coming.
   */
  const writeFence = createWriteFence(
    routedFetch({
      origin: GUEST_ORIGIN,
      local: guestFetch,
      remote: withReadDeadline(session.fetch),
    }),
  );
  /**
   * A fetch as no one (authFetch.ts), whose reads have the deadlines the
   * user's do and one on the whole read as well: they are of servers
   * anyone may name.
   */
  const noOneFetch = withReadDeadline(anonymousFetch, READ_DEADLINE_MS, WHOLE_READ_MS);
  /**
   * What is read outside the user's storages as no one, each document
   * under FOREIGN_LIMITS and all of them within FOREIGN_READS_BUDGET
   * together in a page session: an instance anyone may make may list a
   * thousand decks, each with two documents as large as a release.
   */
  const foreignReads = sharedReadBudget({
    limits: FOREIGN_LIMITS,
    budget: FOREIGN_READS_BUDGET,
    rereads: FOREIGN_REREADS,
  });
  /**
   * What is read as the user in an instance they registered outside their
   * storages, as foreignReads is, within a budget of each server's own,
   * so reads elsewhere never spend it, and all of them within
   * INSTANCE_READS_TOTAL, as a type index may name a thousand
   * servers; what is written there is sent whatever is spent.
   */
  const instanceReads = sharedReadBudget({
    limits: FOREIGN_LIMITS,
    budget: FOREIGN_READS_BUDGET,
    rereads: FOREIGN_REREADS,
    scope: (url) => new URL(url).origin,
    total: INSTANCE_READS_TOTAL,
  });
  /** The user's fetch, with a deadline on the whole read too, as a read as no one has. */
  const elsewhereFetch = withReadDeadline(writeFence.fetch, READ_DEADLINE_MS, WHOLE_READ_MS);
  /**
   * The user's fetch, whose reads outside the user's storages and the
   * folders they entered or made on this page have a deadline on the
   * whole read too, as a read as no one has: an instance they registered
   * or attached elsewhere, its meta document and its releases, may be on
   * any server. A read in their storages, a document or a folder, takes
   * as long as its body keeps coming; while they cannot be found, every
   * read has the deadline.
   */
  const userFetch = routedFetch({
    origin: GUEST_ORIGIN,
    local: writeFence.fetch,
    remote: async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      const storages = await userStorages().catch(() => []);
      const own = [...storages, ...entered].some((folder) => isInFolder(url, folder));
      return (own ? writeFence.fetch : elsewhereFetch)(input, init);
    },
  });
  const podFetch = createPodFence(userFetch);
  /**
   * The release publisher's and the instance repository's alone, for the
   * own access control of a release, or of a public type index the app
   * made: the pod fence lets it write a document's ACL or ACR.
   */
  const shareFetch = createPodFence(userFetch, { accessControl: true });
  /**
   * The fetch of the adapters that read and write an instance's data,
   * whose catalog may name a deck's documents on any server: behind the
   * pod fence, the credential gate (docs/boundaries.md) sends a request
   * as the user only into the user's own pod (ownFolders) and reads
   * anywhere else as no one, writing nothing there; a guest's pod is
   * this browser's. What it reads outside the user's storages, in an
   * instance they registered elsewhere too, is read under
   * FOREIGN_LIMITS, within a budget for the page session (foreignReads,
   * instanceReads).
   */
  const gate = createOwnPodGate({
    fetch: writeFence.fetch,
    // Another's server, read as the user: with a deadline on the whole read, as a read as no one.
    instanceFetch: instanceReads(elsewhereFetch),
    publicFetch: foreignReads(noOneFetch),
    webId: session.webId,
    ownFolders,
    revision: () => folderRevision,
  });
  const dataFetch = createPodFence(
    routedFetch({ origin: GUEST_ORIGIN, local: writeFence.fetch, remote: gate }),
  );
  const siteFetch = createSiteFetch(servedSite);
  const shapes = {
    shapesBaseUrl: SHAPES_BASE,
    vocabBaseUrl: VOCAB_BASE,
    vendorBaseUrl: `${servedSite}vendor/`,
  };
  /**
   * The work on documents the app did not write, off the page, in
   * workers (docs/validation.md, Off the page): reading, parsing and
   * checking a release from a link, a deck file, a release file and the
   * documents an instance's check reads, its own and those elsewhere.
   * Their requests are made here, with the fetches below, so a worker
   * never holds the user's login. One past its deadline, or whose
   * worker ends, is shown as a document too large to read.
   */
  const offPage = createOffPage({ spawn: spawnWorker, config: shapes });
  /**
   * The reads of documents elsewhere, off the page in workers of their
   * own, which read no shapes: one waiting for a slow server holds no
   * other up.
   */
  const readsOffPage = offPageDocumentReader(
    createOffPage({ spawn: spawnWorker, config: shapes, freeWhileWaiting: true }),
  );
  // An instance's documents outside the user's storages, the guest's pod being this browser's, are read off the page.
  readElsewhere(
    dataFetch,
    (url) => !url.startsWith(GUEST_ORIGIN) && gate.isElsewhere(url),
    readsOffPage,
  );
  /** A deck's documents read as no one, outside the user's storages, off the page; never from a guest's pod. */
  const foreignData = () =>
    readElsewhere(createPodFence(foreignReads(noOneFetch)), () => true, readsOffPage);

  const shapeValidator = offPageShapeValidator(
    offPage,
    createShaclShapeValidator({ fetch: dataFetch, shapesFetch: siteFetch, ...shapes }),
    { fetch: dataFetch, siteFetch },
  );
  /** Every write is checked against the shapes before it reaches the pod (docs/validation.md). */
  const checkWrite = shapeValidator.checkSubjects;
  const now = () => new Date();
  const randomId = () => crypto.randomUUID();
  /** The storages a user's profile names, read as no one (ownStorages). */
  const publicStorages = createSolidStorageGateway({
    fetch: noOneFetch,
    profileStorages: getProfileStorages,
  });
  /**
   * The user's storages are found with the user's fetch with the
   * deadline on the whole read: userFetch waits for the storages they
   * find before each of its requests, so a profile that never ends
   * would hold all of them up otherwise.
   */
  const podStorages = createSolidStorageGateway({
    fetch: createPodFence(elsewhereFetch),
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
  /**
   * The storages of the signed-in user, none when no one is: the ones
   * their profile names (pim:storage), or else the storage's root the
   * server shows above their WebID (discoverStorages). A deck's document
   * outside its instance's folder is the deck's only in one of these
   * that holds the instance too, or under one root the server shows
   * (deckPlace.ts). A server may hold many users' pods under one root it
   * does not type. Found once per user, so that a removal over many
   * decks reads the profile once; a failed find is tried again.
   */
  let foundStorages: { user: string; storages: Promise<string[]> } | undefined;
  function userStorages(): Promise<string[]> {
    const user = session.webId();
    if (user === undefined) return Promise.resolve([]);
    if (foundStorages?.user !== user) {
      const storages = storageGateway
        .discoverStorages(user)
        .then((found) => found.map(({ url }) => url));
      // Only this user's find is forgotten: another's may have begun since.
      storages.catch(() => {
        if (foundStorages?.storages === storages) foundStorages = undefined;
      });
      foundStorages = { user, storages };
    }
    return foundStorages.storages;
  }
  const podInstances = createSolidInstanceRepository({
    fetch: podFetch,
    dataFetch,
    publicFetch: noOneFetch,
    checkWrite,
    now,
    randomId,
    userStorages,
    grantPublicRead,
    shareFetch,
  });
  const instanceRepository: typeof podInstances = {
    ...podInstances,
    createInstance: (args) => podInstances.createInstance(args).finally(changed),
    attachInstance: (args) => podInstances.attachInstance(args).finally(changed),
    deleteInstance: (args) => podInstances.deleteInstance(args).finally(changed),
    detachInstance: (args) => podInstances.detachInstance(args).finally(changed),
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
   * The storages a token refused as invalid there means the user's
   * session expired (authFetch.ts): those their profile names, read as
   * no one, since asking as the user would ask the session about itself,
   * and the folders they entered or made on this page. An instance they
   * registered elsewhere is not one: a server that does not take their
   * login says nothing of it.
   */
  async function ownStorages(webId: string): Promise<string[]> {
    const storages = await publicStorages.discoverStorages(webId).catch(() => []);
    return [...storages.map(({ url }) => url), ...entered];
  }
  /**
   * The folders of the user's own pod: their storages with the folders
   * they entered or made on this page, and the instances they
   * registered, kept apart for the credential gate. With
   * `orNone`, a list that cannot be read names none, the others still
   * counting.
   */
  async function ownFolders(webId: string, orNone = false): Promise<OwnFolders> {
    const settled = <T>(listed: Promise<T[]>) => (orNone ? listed.catch(() => []) : listed);
    const [storages, instances] = await Promise.all([
      settled(storageGateway.discoverStorages(webId)),
      settled(instanceRepository.listInstances(webId)),
    ]);
    return {
      storages: [...storages.map(({ url }) => url), ...entered],
      instances: instances.map(({ url }) => url),
    };
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
        publicFetch: noOneFetch,
        webId: session.webId,
        // A release in a folder that cannot be found is read as no one.
        ownFolders: async (webId) => {
          const { storages, instances } = await ownFolders(webId, true);
          return [...storages, ...instances];
        },
      }),
    }),
  });

  /**
   * The drafts: a release file, and a release and what it names read
   * anywhere, are read off the page, as are the release a draft follows
   * and what it names when the draft is assembled.
   */
  const releaseDraftRepository: ReleaseDraftRepository = offPageReleaseDrafts(
    offPage,
    createSolidReleaseDraftRepository({
      fetch: dataFetch,
      checkWrite,
      releaseReads: () => releaseDraftRepository,
    }),
    {
      releaseFetch,
      // What a release names elsewhere is copied into a draft to be published, so it is read as no one.
      publicFetch: routedFetch({ origin: SITE, local: siteFetch, remote: noOneFetch }),
    },
  );

  return createUseCases({
    sessionGateway: session.sessionGateway,
    webId: session.webId,
    webIdDocumentRepository: createSolidWebIdDocumentRepository({ fetch: podFetch }),
    storageGateway,
    instanceRepository,
    deckRepository: createSolidDeckRepository({
      fetch: dataFetch,
      // A deck's cards copied into a draft outside their pod are read as no one, as the gate reads elsewhere;
      // never from a guest's pod, which is this browser's.
      publicFetch: foreignData(),
      checkWrite,
      now,
      randomId,
      userStorages,
    }),
    deckLibrary: createSolidDeckLibrary({
      fetch: siteFetch,
      // The library is published with the site, from decks/.
      indexUrl: libraryIndexUrl ?? `${SITE}decks/index.ttl`,
      // A release from a link is read and checked against the library's shapes off the page, that read alone.
      documents: offPageReleaseDocuments(offPage, siteFetch),
    }),
    preferencesRepository: createSolidPreferencesRepository({ fetch: dataFetch, checkWrite }),
    paletteRepository: createSolidPaletteRepository({ fetch: dataFetch, checkWrite }),
    reviewStateRepository: createSolidReviewStateRepository({
      fetch: dataFetch,
      // A deck's states copied into another deck outside their pod are read as no one, as its cards are;
      // never from a guest's pod, which is this browser's.
      publicFetch: foreignData(),
      checkWrite,
      userStorages,
    }),
    shapeValidator,
    instanceCopier,
    updateJournal: createLocalStorageUpdateJournal(),
    logoutChannel: createLogoutChannel(),
    languagePreference: createLocalStorageLanguagePreference(),
    themePreference: createLocalStorageSetting(THEME_KEY, THEME_SETTING),
    palettePreference: createLocalStorageSetting(PALETTE_KEY, PALETTE_SETTING),
    customPalettePreference: createLocalStorageCustomPalettePreference(),
    textSizePreference: createLocalStorageSetting(TEXT_SIZE_KEY, TEXT_SIZE_SETTING),
    seenHighlights: createLocalStorageSeenHighlights(),
    deviceStore: createWebStorageDeviceStore(),
    tabStore: createWebStorageDeviceStore(() => globalThis.sessionStorage),
    writeFence,
    digestRepository: createSolidDigestRepository({ fetch: dataFetch, checkWrite }),
    answerLog: createSolidAnswerLog({ fetch: dataFetch, checkWrite }),
    ruleset,
    // Its profile is written through the fences too, as every pod write is.
    guestPod: createLocalGuestPod({ fetch: podFetch, store: guestStore }),
    // A deck file is read off the page.
    deckArchive: offPageDeckArchive(
      offPage,
      createSolidDeckArchive({
        fetch: dataFetch,
        // A deck's documents outside its instance's pod are exported as no one reads them.
        publicFetch: foreignData(),
      }),
    ),
    fileExchange: createBrowserFileExchange(),
    releaseDraftRepository,
    // A release is written as the user, its access control too; whether it is public, asked as no one;
    // the releases a catalog links, read as the instance's data is.
    releasePublisher: createSolidReleasePublisher({
      fetch: podFetch,
      dataFetch,
      shareFetch,
      publicFetch: noOneFetch,
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
 * states as its @base; any other request, a release's from a link among
 * them, is passed on as it is, its reads with the deadlines a read as
 * no one has (readDeadline.ts).
 */
export function createSiteFetch(servedSite: string): typeof globalThis.fetch {
  const elsewhere = withReadDeadline(
    (input, init) => globalThis.fetch(input, init),
    READ_DEADLINE_MS,
    WHOLE_READ_MS,
  );
  return (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith(SITE)) return elsewhere(input, init);
    const served = `${servedSite}${url.slice(SITE.length)}`;
    // A Request keeps its method and headers at the served address.
    return globalThis.fetch(input instanceof Request ? new Request(served, input) : served, init);
  };
}
