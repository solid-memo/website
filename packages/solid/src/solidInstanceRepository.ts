// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { anonymousFetch } from "./authFetch";
import { deleteContainer } from "./client/resources";
import { FOREIGN_LIMITS, limitedFetch } from "./client/readLimits";
import { createSolidDataset, getThing, setThing } from "./client/rdf";
import type { InstanceRepository } from "@solid-memo/application/ports";
import {
  INSTANCE_FORMAT_VERSION,
  type Instance,
  type InstanceMeta,
  type OldRegistrationClass,
  type OldRegistrations,
  type RegistrationTarget,
} from "@solid-memo/domain/instance";
import { instanceAddressOf, isInstanceAddress, metaUrlOf } from "@solid-memo/domain/instanceLayout";
import { isInstanceOutdated } from "@solid-memo/domain/migration";
import { getSolidDatasetOrNull, readDataset, removeOwned, saveDataset } from "./datasets";
import { subjectsOfClasses } from "./ownership";
import type { UserStorages } from "./deckPlace";
import { deleteInstanceData } from "./instanceData";
import { noWriteCheck, type WriteCheck } from "./writeCheck";
import { toInstance, toInstanceMeta, toInstanceMetaThing } from "./mappers/instanceMapper";
import {
  addInstanceRegistration,
  createTypeIndex,
  ensureTypeIndex,
  locateTypeIndexes,
  readInstanceRegistrations,
  readOldRegistrations,
  removeInstanceRegistrations,
  removeOldRegistrations,
  renameInstanceRegistrations,
  type InstanceRegistration,
  type TypeIndexes,
} from "./typeIndex";
import { ensureTrailingSlash, lastPathSegment } from "./urls";
import { SM } from "./vocab";
import { AppError } from "@solid-memo/domain/appError";
import { MAX_CATALOG_LINKS } from "@solid-memo/domain/deck";

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
  /** The signed-in user's storages, for where a deck's document is (deckPlace.ts UserStorages); none by default. */
  userStorages?: UserStorages;
}

export function createSolidInstanceRepository({
  fetch,
  dataFetch = fetch,
  publicFetch = anonymousFetch,
  now,
  randomId,
  userStorages,
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
      // One registration that does not map is left out, not the list.
      const instances = [...byUrl.values()].flatMap((registration) => {
        try {
          return [toInstance(registration)];
        } catch {
          return [];
        }
      });
      // A type index is data another app may have written, and each instance listed is read: no more than a catalog's links.
      return instances.slice(0, MAX_CATALOG_LINKS);
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
      ).catch((error: unknown) => {
        // One taken off the list stays there, so reloading wouldn't help: the user is told to attach it.
        throw error instanceof AppError && error.code === "createdElsewhere"
          ? new AppError("instanceAlreadyThere", { url })
          : error;
      });
      try {
        const locations = await ownTypeIndexes(webId, fetch, publicFetch);
        const indexUrl =
          (registrationTarget === "private"
            ? locations.privateIndexUrl
            : locations.publicIndexUrl) ??
          (await createTypeIndex(registrationTarget, webId, url, fetch));
        await addInstanceRegistration(
          indexUrl,
          { instanceUrl: url, title: name },
          randomId,
          locations.fetch,
        );
      } catch (error) {
        await bestEffortCleanup(metaUrl, url, fetch);
        throw error;
      }
      return { url, name };
    },

    async attachInstance({ webId, instanceUrl, registrationTarget }) {
      // As a request would send it, so every address made from it is compared as sent;
      // an http(s) folder only, as a registration's is (isInstanceAddress).
      const url = instanceAddressOf(instanceUrl);
      if (!isInstanceAddress(url)) throw new AppError("notAnInstanceNoMeta", { url: instanceUrl });
      const name = await readInstanceName(url, metaFetch);
      const index = await ensureTypeIndex(registrationTarget, webId, url, fetch, publicFetch);
      await addInstanceRegistration(
        index.url,
        { instanceUrl: url, title: name },
        randomId,
        index.fetch,
      );
      return { url, name };
    },

    async readOldRegistrations({ webId, instanceUrl }): Promise<OldRegistrations> {
      const registrations: OldRegistrations["registrations"] = [];
      const unreadableIndexes: RegistrationTarget[] = [];
      for (const index of await oldRegistrationsOf(webId, instanceUrl)) {
        if (index.classes === null) unreadableIndexes.push(index.kind);
        else
          registrations.push(
            ...index.classes.map((dataClass) => ({ dataClass, index: index.kind })),
          );
      }
      return { registrations, unreadableIndexes };
    },

    async removeOldRegistrations({ webId, instanceUrl }) {
      const failures: unknown[] = [];
      for (const index of await oldRegistrationsOf(webId, instanceUrl)) {
        // One that could not be read is not written to; one that holds none is not written either.
        if (index.classes === null || index.classes.length === 0) continue;
        try {
          await removeOldRegistrations(index.url, instanceUrl, index.fetch);
        } catch (error) {
          // One gone since it was read has nothing left to remove.
          if ((error as { statusCode?: number }).statusCode !== 404) failures.push(error);
        }
      }
      if (failures.length > 0) throw failures[0];
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
      const deletion = await deleteInstanceData(url, dataFetch, userStorages);
      await removeRegistrations(webId, url);
      return deletion;
    },

    async detachInstance({ webId, instance }) {
      await removeRegistrations(webId, ensureTrailingSlash(instance.url));
    },
  };

  /**
   * Each of the user's own type indexes (ownTypeIndexes), the private
   * one first, with the classes of the instance's data it holds a
   * registration of that earlier versions wrote (readOldRegistrations):
   * none when the index is not there (404), null when it cannot be read.
   */
  async function oldRegistrationsOf(
    webId: string,
    instanceUrl: string,
  ): Promise<OldRegistrationsIndex[]> {
    const locations = await ownTypeIndexes(webId, fetch, publicFetch);
    const indexes: OldRegistrationsIndex[] = [];
    for (const [kind, url] of [
      ["private", locations.privateIndexUrl],
      ["public", locations.publicIndexUrl],
    ] as const) {
      // A profile that names one document as both indexes has it read once, as the private one.
      if (url === null || indexes.some((index) => index.url === url)) continue;
      let classes: OldRegistrationClass[] | null;
      try {
        classes = await readOldRegistrations(url, instanceUrl, locations.fetch);
      } catch (error) {
        classes = (error as { statusCode?: number }).statusCode === 404 ? [] : null;
      }
      indexes.push({ kind, url, fetch: locations.fetch, classes });
    }
    return indexes;
  }

  /**
   * Drop the registrations of the instance's data from the user's own
   * type indexes, reading and writing only those. Each is tried whatever
   * the other answers, one that isn't there having nothing to remove, as
   * the list reads each on its own; the first failure is thrown once
   * both were tried.
   */
  async function removeRegistrations(webId: string, url: string): Promise<void> {
    const locations = await ownTypeIndexes(webId, fetch, publicFetch);
    const failures: unknown[] = [];
    for (const indexUrl of [locations.privateIndexUrl, locations.publicIndexUrl]) {
      if (indexUrl === null) continue;
      try {
        await removeInstanceRegistrations(indexUrl, url, locations.fetch);
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode !== 404) failures.push(error);
      }
    }
    if (failures.length > 0) throw failures[0];
  }
}

/** One of the user's own type indexes, with the old registrations it holds (null: unreadable). */
type OldRegistrationsIndex = {
  kind: RegistrationTarget;
  url: string;
  fetch: typeof globalThis.fetch;
  classes: OldRegistrationClass[] | null;
};

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
