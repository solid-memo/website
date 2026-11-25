// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { SITE } from "@solid-memo/vocab/ns";
import { createUseCases, type UseCases } from "@solid-memo/application/useCases";
import { NO_PORTS } from "@solid-memo/application/testing/noPorts";
import type { ResourceStore } from "@solid-memo/application/ports/device";
import { GUEST_ORIGIN } from "@solid-memo/domain/guest";
import { getProfileStorages } from "@solid-memo/solid-client/resources";
import { createLocalGuestPod } from "../localGuestPod";
import { createLocalPod } from "../localPod";
import { createMemoryResourceStore } from "../memoryResourceStore";
import { routedFetch } from "../routedFetch";
import { createShaclShapeValidator } from "../shaclShapeValidator";
import { createSolidAnswerLog } from "../solidAnswerLog";
import { createSolidDeckArchive } from "../solidDeckArchive";
import { createSolidDeckLibrary, releaseDocumentsOf } from "../solidDeckLibrary";
import { createSolidDeckRepository } from "../solidDeckRepository";
import { createSolidDigestRepository } from "../solidDigestRepository";
import { createSolidInstanceCopier } from "../solidInstanceCopier";
import { createSolidInstanceGraphReader } from "../solidInstanceGraphReader";
import { createSolidInstanceRepository } from "../solidInstanceRepository";
import { createSolidPaletteRepository } from "../solidPaletteRepository";
import { createSolidPreferencesRepository } from "../solidPreferencesRepository";
import { createSolidReleaseDraftRepository } from "../solidReleaseDraftRepository";
import { createSolidReleasePublisher } from "../solidReleasePublisher";
import { createSolidReviewStateRepository } from "../solidReviewStateRepository";
import { createSolidStorageGateway } from "../solidStorageGateway";
import { createSolidWebIdDocumentRepository } from "../solidWebIdDocumentRepository";
import { createWriteFence } from "../writeFence";

/** The pod of the user the wired app is signed in as. */
export const POD = "https://alice.example/";
export const WEB_ID = `${POD}profile/card#me`;
export const SESSION = { webId: WEB_ID };

/** A file the app gave the user, or one the user is about to pick. */
export type ExchangedFile = { name: string; text: string };

/**
 * What an app reads of the site, which is the same for every app of a
 * test: the shapes, as its validator holds them once read, and the
 * library. Many apps wired one after another share one, so the shapes
 * and the releases are read and held once; each reads the pods through
 * the app wired last (`use`), so only one of them runs at a time.
 */
export interface Site {
  shapeValidator: ReturnType<typeof createShaclShapeValidator>;
  deckLibrary: ReturnType<typeof createSolidDeckLibrary>;
  /** The site's documents, and the pods' for a release published from one. */
  fetch: typeof globalThis.fetch;
  /** Reads the pods through `fetch` from now on. */
  use(fetch: typeof globalThis.fetch): void;
}

/** The site as this repository publishes it, read from disk, for the apps of one test. */
export function siteOf(): Site {
  let pods: typeof globalThis.fetch = async () => {
    throw new Error("No app is wired to this site yet.");
  };
  const podFetch: typeof globalThis.fetch = (input, init) => pods(input, init);
  const fetch = routedFetch({ origin: SITE, local: shapesFetch, remote: podFetch });
  const shapeValidator = createShaclShapeValidator({
    fetch: podFetch,
    shapesFetch,
    ...SHAPE_SOURCES,
  });
  return {
    shapeValidator,
    deckLibrary: createSolidDeckLibrary({
      fetch,
      indexUrl: `${SITE}decks/index.ttl`,
      documents: releaseDocumentsOf((url, dataset) =>
        shapeValidator.validateDataset(url, dataset, "library"),
      ),
    }),
    fetch,
    use(fetch) {
      pods = fetch;
    },
  };
}

/**
 * Every use case over the app's own Solid adapters, wired as
 * createAppUseCases wires them (packages/composition/), for tests that
 * run the app end to end without a browser or a network. The user's pod
 * and a guest's are local pods over the stores given. The library and
 * the shapes are this repository's, read from disk. Every write is
 * checked against the shapes, as the app checks it. What only a browser
 * has is left out: the device's preferences keep nothing (NO_PORTS), and
 * a file saved is kept in `saved`, the next one opened taken from
 * `toOpen`.
 *
 * `written` is called after each request that is not a read, once the
 * pod has answered it.
 */
export function wiredApp({
  store = createMemoryResourceStore(),
  guestStore = createMemoryResourceStore(),
  now = () => new Date(),
  written = async () => undefined,
  site = siteOf(),
  newId = () => crypto.randomUUID(),
}: {
  /** Fresh identifiers, a document's version among them; random unless a test needs the same pod every time. */
  newId?: () => string;
  store?: ResourceStore;
  guestStore?: ResourceStore;
  now?: () => Date;
  /** The site the app reads; one of its own unless a test wires many apps (siteOf). */
  site?: Site;
  written?: (method: string, url: string) => Promise<void>;
} = {}): {
  useCases: UseCases;
  store: ResourceStore;
  guestStore: ResourceStore;
  /** The fetch every adapter is given, for a test that puts a document in place itself. */
  fetch: typeof globalThis.fetch;
  saved: ExchangedFile[];
  toOpen: ExchangedFile[];
  /** Resolves once the app has no request under way: an answer on its way to the log is in it. */
  settled: () => Promise<void>;
} {
  const newEtag = () => `"${newId()}"`;
  const pods = routedFetch({
    origin: GUEST_ORIGIN,
    local: createLocalPod({ root: GUEST_ORIGIN, store: guestStore, newEtag }),
    remote: createLocalPod({ root: POD, store, newEtag }),
  });
  let underWay = 0;
  let asked = 0;
  const watched: typeof globalThis.fetch = async (input, init) => {
    underWay++;
    asked++;
    try {
      const response = await pods(input, init);
      const method = (init?.method ?? "GET").toUpperCase();
      if (method !== "GET" && method !== "HEAD") {
        await written(method, input instanceof Request ? input.url : String(input));
      }
      return response;
    } finally {
      underWay--;
    }
  };
  /** Resolves once no request is under way and none was made for a few turns of the event loop. */
  const settled = async () => {
    for (let quiet = 0; quiet < 5; ) {
      const before = asked;
      await new Promise((resolve) => setTimeout(resolve, 0));
      quiet = underWay === 0 && asked === before ? quiet + 1 : 0;
    }
  };
  const writeFence = createWriteFence(watched);
  const fetch = writeFence.fetch;
  site.use(fetch);
  const { shapeValidator, deckLibrary, fetch: siteFetch } = site;
  const checkWrite = shapeValidator.checkSubjects;
  const ids = { now, randomId: newId };
  const userStorages = async () => [POD];
  const grantPublicRead = async () => false;
  const saved: ExchangedFile[] = [];
  const toOpen: ExchangedFile[] = [];
  const useCases = createUseCases({
    ...NO_PORTS,
    sessionGateway: {
      restore: async () => null,
      discoverOidcIssuer: async () => "https://idp.example/",
      onSessionExpired: () => () => undefined,
      onReturnedWithoutSession: () => () => undefined,
      login: async () => undefined,
      loginWithIssuer: async () => undefined,
      logout: async () => undefined,
      hasStoredSession: async () => false,
      forgetStoredSession: async () => undefined,
    },
    webId: () => WEB_ID,
    webIdDocumentRepository: createSolidWebIdDocumentRepository({ fetch }),
    storageGateway: createSolidStorageGateway({ fetch, profileStorages: getProfileStorages }),
    instanceRepository: createSolidInstanceRepository({
      fetch,
      publicFetch: fetch,
      checkWrite,
      userStorages,
      grantPublicRead,
      ...ids,
    }),
    deckRepository: createSolidDeckRepository({
      fetch,
      publicFetch: fetch,
      checkWrite,
      userStorages,
      ...ids,
    }),
    deckLibrary,
    preferencesRepository: createSolidPreferencesRepository({ fetch, checkWrite }),
    paletteRepository: createSolidPaletteRepository({ fetch, checkWrite }),
    reviewStateRepository: createSolidReviewStateRepository({
      fetch,
      publicFetch: fetch,
      checkWrite,
      userStorages,
    }),
    shapeValidator,
    instanceCopier: createSolidInstanceCopier({ fetch }),
    digestRepository: createSolidDigestRepository({ fetch, checkWrite }),
    answerLog: createSolidAnswerLog({ fetch, checkWrite }),
    guestPod: createLocalGuestPod({ fetch, store: guestStore }),
    writeFence,
    now,
    newId,
    // The first of what there is to choose from, every time.
    random: () => 0,
    deckArchive: createSolidDeckArchive({ fetch, publicFetch: fetch }),
    fileExchange: {
      save: (name, _mediaType, text) => void saved.push({ name, text }),
      open: async () => toOpen.shift() ?? null,
    },
    releaseDraftRepository: createSolidReleaseDraftRepository({
      fetch,
      releaseFetch: siteFetch,
      publicFetch: siteFetch,
      checkWrite,
    }),
    releasePublisher: createSolidReleasePublisher({
      fetch,
      dataFetch: fetch,
      shareFetch: fetch,
      publicFetch: fetch,
      grantPublicRead,
    }),
    instanceGraphReader: createSolidInstanceGraphReader({ fetch }),
  });
  return { useCases, store, guestStore, fetch, saved, toOpen, settled };
}

/** A copy of a store, each resource as it is: a pod set back to where a test left it. */
export async function copyOf(store: ResourceStore): Promise<ResourceStore> {
  const copy = createMemoryResourceStore();
  for (const url of await store.urls()) await copy.set(url, (await store.get(url))!);
  return copy;
}

/** Every triple of a store's RDF documents, as N-Triples lines, by document. */
export async function triplesOf(store: ResourceStore): Promise<Map<string, readonly string[]>> {
  const documents = new Map<string, readonly string[]>();
  for (const url of await store.urls()) {
    const resource = await store.get(url);
    if (resource?.kind === "rdf") documents.set(url, resource.triples);
  }
  return documents;
}
