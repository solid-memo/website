// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { anonymousFetch } from "./authFetch";
import { deleteContainer } from "./client/resources";
import { FOREIGN_LIMITS, limitedFetch } from "./client/readLimits";
import { createSolidDataset, getThing, setThing } from "./client/rdf";
import type { InstanceRepository } from "@solid-memo/application/ports";
import {
  DATA_CLASSES,
  INSTANCE_FORMAT_VERSION,
  isPrivateOnly,
  type DataClass,
  type DataClassRegistrations,
  type Instance,
  type InstanceMeta,
  type RegistrationTarget,
} from "@solid-memo/domain/instance";
import { instanceAddressOf, isPlainHttpUrl, metaUrlOf } from "@solid-memo/domain/instanceLayout";
import { isInstanceOutdated } from "@solid-memo/domain/migration";
import { getSolidDatasetOrNull, readDataset, removeOwned, saveDataset } from "./datasets";
import { subjectsOfClasses } from "./ownership";
import { deleteInstanceData } from "./instanceData";
import { noWriteCheck, type WriteCheck } from "./writeCheck";
import { toInstance, toInstanceMeta, toInstanceMetaThing } from "./mappers/instanceMapper";
import {
  addRegistrations,
  createTypeIndex,
  ensureTypeIndex,
  locateTypeIndexes,
  readInstanceRegistrations,
  readRegisteredClasses,
  removeInstanceRegistrations,
  renameInstanceRegistrations,
  type InstanceRegistration,
  type TypeIndexes,
} from "./typeIndex";
import { ensureTrailingSlash, lastPathSegment } from "./urls";
import { SM } from "./vocab";
import { AppError } from "@solid-memo/domain/appError";

export interface SolidInstanceRepositoryDeps {
  fetch: typeof globalThis.fetch;
  /**
   * What an instance's data is deleted through, `fetch` when unset: the
   * catalog names its decks' documents, which may be anywhere, so the app
   * passes its credential gate (docs/boundaries.md).
   */
  dataFetch?: typeof globalThis.fetch;
  /**
   * What the type indexes' fetch reads anything outside the profile's
   * own places through (locateTypeIndexes), as no one: `anonymousFetch`
   * when unset. An index there is none of the user's (ownTypeIndexes).
   */
  publicFetch?: typeof globalThis.fetch;
  now: () => Date;
  randomId: () => string;
  /** Checks what is about to be written; see writeCheck.ts. */
  checkWrite?: WriteCheck;
}

export function createSolidInstanceRepository({
  fetch,
  dataFetch = fetch,
  publicFetch = anonymousFetch,
  now,
  randomId,
  checkWrite = noWriteCheck,
}: SolidInstanceRepositoryDeps): InstanceRepository {
  /**
   * An instance's meta document is read under limits: a folder anyone
   * may make can be added by its address, and is read as soon as it is,
   * then again each time the app reads its description. It is written
   * through the same fetch, so that a write forgets the read it kept
   * (datasets.ts) and the next read is not answered from it: a server
   * may give a document rewritten within the same second the same
   * version.
   */
  const metaFetch = limitedFetch(fetch, FOREIGN_LIMITS);
  return {
    async listInstances(webId): Promise<Instance[]> {
      const locations = await ownTypeIndexes(webId, fetch, publicFetch);
      const byUrl = new Map<string, InstanceRegistration>();
      for (const indexUrl of [locations.privateIndexUrl, locations.publicIndexUrl]) {
        if (indexUrl === null) continue;
        for (const registration of await readRegistrationsSafely(indexUrl, locations.fetch)) {
          const url = ensureTrailingSlash(registration.containerUrl);
          if (!byUrl.has(url)) byUrl.set(url, registration);
        }
      }
      return [...byUrl.values()].map(toInstance);
    },

    async getRegistrationOptions(webId) {
      const locations = await ownTypeIndexes(webId, fetch, publicFetch);
      return {
        privateIndexExists: locations.privateIndexUrl !== null,
        publicIndexExists: locations.publicIndexUrl !== null,
      };
    },

    async createInstance({ webId, containerUrl, name, registrationTarget }) {
      // As a request would send it, so every address made from it is compared as sent.
      const url = instanceAddressOf(containerUrl);
      const metaUrl = metaUrlOf(url);
      await saveMetaDocument(
        metaUrl,
        { name, createdAt: now().toISOString(), formatVersion: INSTANCE_FORMAT_VERSION },
        metaFetch,
        checkWrite,
      );
      // The private index, for the review states' and answers' registrations of an instance registered elsewhere.
      let privateIndexElsewhere: string | null;
      let indexFetch: typeof globalThis.fetch;
      try {
        const locations = await ownTypeIndexes(webId, fetch, publicFetch);
        indexFetch = locations.fetch;
        const indexUrl =
          (registrationTarget === "private"
            ? locations.privateIndexUrl
            : locations.publicIndexUrl) ??
          (await createTypeIndex(registrationTarget, webId, url, fetch));
        privateIndexElsewhere =
          locations.privateIndexUrl === indexUrl ? null : locations.privateIndexUrl;
        await addRegistrations(
          indexUrl,
          { instanceUrl: url, title: name, classes: wantedIn(registrationTarget, true) },
          randomId,
          indexFetch,
        );
      } catch (error) {
        await bestEffortCleanup(metaUrl, url, fetch);
        throw error;
      }
      // The instance works without them, and Preferences adds them later: a private index that refuses them does not fail the creation.
      if (privateIndexElsewhere !== null) {
        try {
          await addRegistrations(
            privateIndexElsewhere,
            { instanceUrl: url, title: name, classes: wantedIn("private", false) },
            randomId,
            indexFetch,
          );
        } catch {
          // Left for Preferences to add.
        }
      }
      return { url, name };
    },

    async attachInstance({ webId, instanceUrl, registrationTarget }) {
      // As a request would send it, so every address made from it is compared as sent; an http(s) folder only.
      const url = instanceAddressOf(instanceUrl);
      if (!isPlainHttpUrl(url)) throw new AppError("notAnInstanceNoMeta", { url: instanceUrl });
      const name = await readInstanceName(url, metaFetch);
      const index = await ensureTypeIndex(registrationTarget, webId, url, fetch, publicFetch);
      await addRegistrations(
        index.url,
        { instanceUrl: url, title: name, classes: ["instance"] },
        randomId,
        index.fetch,
      );
      return { url, name };
    },

    async readDataClassRegistrations({ webId, instanceUrl }) {
      return registrationsOf(await indexesOf(webId, instanceUrl, fetch, publicFetch));
    },

    async registerDataClasses({ webId, instanceUrl, title }) {
      const { indexes, indexFetch } = await indexesOf(webId, instanceUrl, fetch, publicFetch);
      for (const index of indexes) {
        const missing = index.wanted.filter((dataClass) => !index.registered.includes(dataClass));
        if (missing.length === 0) continue;
        await addRegistrations(
          index.url,
          { instanceUrl, title, classes: missing },
          randomId,
          indexFetch,
        );
      }
    },

    async renameRegistrations({ webId, instanceUrl, title }) {
      const locations = await ownTypeIndexes(webId, fetch, publicFetch);
      for (const indexUrl of [locations.privateIndexUrl, locations.publicIndexUrl]) {
        if (indexUrl === null) continue;
        await renameInstanceRegistrations(
          indexUrl,
          { containerUrl: instanceUrl, title },
          locations.fetch,
        );
      }
    },

    async readMeta(instanceUrl): Promise<InstanceMeta | null> {
      const metaUrl = metaUrlOf(instanceUrl);
      const dataset = await getSolidDatasetOrNull(metaUrl, metaFetch);
      if (dataset === null) return null;
      const subject = getThing(dataset, `${metaUrl}#it`);
      return subject === null ? null : toInstanceMeta(subject);
    },

    async saveMeta(instanceUrl, meta): Promise<void> {
      const metaUrl = metaUrlOf(instanceUrl);
      const dataset = await getSolidDatasetOrNull(metaUrl, metaFetch);
      const url = `${metaUrl}#it`;
      const existing = dataset === null ? null : getThing(dataset, url);
      if (dataset === null || existing === null) {
        throw new AppError("noMetaToUpdate", { url: instanceUrl });
      }
      const updated = setThing(dataset, toInstanceMetaThing(url, meta, existing));
      await checkWrite(updated, [url], "pod");
      // If-Match the read above.
      await saveDataset(metaUrl, updated, metaFetch);
    },

    async upgradeMeta(instanceUrl): Promise<boolean> {
      const metaUrl = metaUrlOf(instanceUrl);
      const dataset = await getSolidDatasetOrNull(metaUrl, metaFetch);
      const url = `${metaUrl}#it`;
      const existing = dataset === null ? null : getThing(dataset, url);
      // The record as read, brought up to date in memory, written in this app's format.
      const meta = existing === null ? null : toInstanceMeta(existing);
      if (meta === null || !isInstanceOutdated(meta)) return false;
      const updated = setThing(dataset!, toInstanceMetaThing(url, meta, existing));
      await checkWrite(updated, [url], "pod");
      // If-Match the read above.
      await saveDataset(metaUrl, updated, metaFetch);
      return true;
    },

    async deleteInstance({ webId, instance }) {
      const url = ensureTrailingSlash(instance.url);
      const deletion = await deleteInstanceData(url, dataFetch);
      const locations = await ownTypeIndexes(webId, fetch, publicFetch);
      for (const indexUrl of [locations.privateIndexUrl, locations.publicIndexUrl]) {
        if (indexUrl === null) continue;
        await removeInstanceRegistrations(indexUrl, url, locations.fetch);
      }
      return deletion;
    },
  };
}

/**
 * The type indexes (locateTypeIndexes), but for one outside the
 * profile's own places, taken as none: it may be someone else's, so
 * nothing it registers is the user's, and nothing is written there
 * (docs/boundaries.md). Without one of its kind, the app offers to
 * create the user's own.
 */
async function ownTypeIndexes(
  webId: string,
  fetch: typeof globalThis.fetch,
  publicFetch: typeof globalThis.fetch,
): Promise<TypeIndexes> {
  const indexes = await locateTypeIndexes(webId, fetch, publicFetch);
  const own = (url: string | null) => (url !== null && indexes.inPlaces(url) ? url : null);
  return {
    ...indexes,
    privateIndexUrl: own(indexes.privateIndexUrl),
    publicIndexUrl: own(indexes.publicIndexUrl),
  };
}

/**
 * The classes of an instance's data that belong in a type index of a
 * kind: Solid Memo's own registration, the catalog's, the decks' and
 * the cards' in each index that registers the instance (`holding`), and
 * the review states' and answers' in the private index only, whatever
 * index registers the instance.
 */
function wantedIn(kind: RegistrationTarget, holding: boolean): DataClass[] {
  return DATA_CLASSES.filter((dataClass) =>
    isPrivateOnly(dataClass) ? kind === "private" : holding,
  );
}

interface IndexRegistrations {
  kind: RegistrationTarget;
  url: string;
  /** The classes of the instance's data it registers. */
  registered: DataClass[];
  /** The classes of the instance's data that belong in it (wantedIn). */
  wanted: DataClass[];
}

/**
 * Each of the user's type indexes (ownTypeIndexes), private first, with
 * what it registers of the instance's data and what belongs in it; one
 * that cannot be read is left out, and said to be unreadable.
 */
async function indexesOf(
  webId: string,
  instanceUrl: string,
  fetch: typeof globalThis.fetch,
  publicFetch: typeof globalThis.fetch,
): Promise<{
  indexes: IndexRegistrations[];
  /** What the indexes are read and written through (TypeIndexes). */
  indexFetch: typeof globalThis.fetch;
  privateIndexMissing: boolean;
  unreadableIndexes: RegistrationTarget[];
}> {
  const {
    privateIndexUrl,
    publicIndexUrl,
    fetch: indexFetch,
  } = await ownTypeIndexes(webId, fetch, publicFetch);
  const indexes: IndexRegistrations[] = [];
  const unreadableIndexes: RegistrationTarget[] = [];
  for (const [kind, url] of [
    ["private", privateIndexUrl],
    ["public", publicIndexUrl],
  ] as const) {
    if (url === null) continue;
    let registered: DataClass[];
    try {
      registered = await readRegisteredClasses(url, instanceUrl, indexFetch);
    } catch {
      unreadableIndexes.push(kind);
      continue;
    }
    indexes.push({
      kind,
      url,
      registered,
      wanted: wantedIn(kind, registered.includes("instance")),
    });
  }
  return {
    indexes,
    indexFetch,
    privateIndexMissing: privateIndexUrl === null,
    unreadableIndexes,
  };
}

/** Every registration that belongs in an index, by class, the private index's first, and whether it is there. */
function registrationsOf({
  indexes,
  privateIndexMissing,
  unreadableIndexes,
}: {
  indexes: IndexRegistrations[];
  privateIndexMissing: boolean;
  unreadableIndexes: RegistrationTarget[];
}): DataClassRegistrations {
  return {
    registrations: DATA_CLASSES.flatMap((dataClass) =>
      indexes
        .filter((index) => index.wanted.includes(dataClass))
        .map((index) => ({
          dataClass,
          index: index.kind,
          registered: index.registered.includes(dataClass),
        })),
    ),
    privateIndexMissing,
    unreadableIndexes,
  };
}

async function readRegistrationsSafely(
  indexUrl: string,
  fetch: typeof globalThis.fetch,
): Promise<InstanceRegistration[]> {
  try {
    return await readInstanceRegistrations(indexUrl, fetch);
  } catch {
    return [];
  }
}

async function saveMetaDocument(
  metaUrl: string,
  meta: InstanceMeta,
  fetch: typeof globalThis.fetch,
  checkWrite: WriteCheck,
): Promise<void> {
  const dataset = setThing(createSolidDataset(), toInstanceMetaThing(`${metaUrl}#it`, meta, null));
  await checkWrite(dataset, [`${metaUrl}#it`], "pod");
  await saveDataset(metaUrl, dataset, fetch);
}

async function readInstanceName(
  instanceUrl: string,
  fetch: typeof globalThis.fetch,
): Promise<string> {
  const metaUrl = metaUrlOf(instanceUrl);
  let dataset: Awaited<ReturnType<typeof readDataset>>;
  try {
    dataset = await readDataset(metaUrl, fetch);
  } catch {
    throw new AppError("notAnInstanceNoMeta", { url: instanceUrl });
  }
  const meta = getThing(dataset, `${metaUrl}#it`);
  if (meta === null) {
    throw new AppError("notAnInstanceNoSubject", { url: instanceUrl });
  }
  return toInstanceMeta(meta)?.name ?? lastPathSegment(instanceUrl);
}

/**
 * Take back the instance's `meta.ttl` a creation that failed wrote: its
 * `#it` only, the document when nothing else is in it (removeOwned),
 * then the folder if it is then empty. Whatever fails is left.
 */
async function bestEffortCleanup(
  metaUrl: string,
  containerUrl: string,
  fetch: typeof globalThis.fetch,
): Promise<void> {
  try {
    await removeOwned(metaUrl, subjectsOfClasses(SM.Instance), fetch);
    await deleteContainer(containerUrl, { fetch });
  } catch {}
}
