import {
  createSolidDataset,
  deleteContainer,
  deleteSolidDataset,
  getThing,
  setThing,
} from "@inrupt/solid-client";
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
import { metaUrlOf } from "@solid-memo/domain/instanceLayout";
import { isInstanceOutdated } from "@solid-memo/domain/migration";
import { getSolidDatasetOrNull, readDataset, saveDataset } from "./datasets";
import { deleteInstanceData } from "./instanceData";
import { noWriteCheck, type WriteCheck } from "./writeCheck";
import {
  toInstance,
  toInstanceMeta,
  toInstanceMetaThing,
} from "./mappers/instanceMapper";
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
} from "./typeIndex";
import { ensureTrailingSlash, lastPathSegment } from "./urls";
import { AppError } from "@solid-memo/domain/appError";

export interface SolidInstanceRepositoryDeps {
  fetch: typeof globalThis.fetch;
  now: () => Date;
  randomId: () => string;
  /** Checks what is about to be written; see writeCheck.ts. */
  checkWrite?: WriteCheck;
}

export function createSolidInstanceRepository({
  fetch,
  now,
  randomId,
  checkWrite = noWriteCheck,
}: SolidInstanceRepositoryDeps): InstanceRepository {
  return {
    async listInstances(webId): Promise<Instance[]> {
      const locations = await locateTypeIndexes(webId, fetch);
      const byUrl = new Map<string, InstanceRegistration>();
      for (const indexUrl of [
        locations.privateIndexUrl,
        locations.publicIndexUrl,
      ]) {
        if (indexUrl === null) continue;
        for (const registration of await readRegistrationsSafely(
          indexUrl,
          fetch,
        )) {
          const url = ensureTrailingSlash(registration.containerUrl);
          if (!byUrl.has(url)) byUrl.set(url, registration);
        }
      }
      return [...byUrl.values()].map(toInstance);
    },

    async getRegistrationOptions(webId) {
      const locations = await locateTypeIndexes(webId, fetch);
      return {
        privateIndexExists: locations.privateIndexUrl !== null,
        publicIndexExists: locations.publicIndexUrl !== null,
      };
    },

    async createInstance({ webId, containerUrl, name, registrationTarget }) {
      const url = ensureTrailingSlash(containerUrl);
      const metaUrl = metaUrlOf(url);
      await saveMetaDocument(
        metaUrl,
        { name, createdAt: now().toISOString(), formatVersion: INSTANCE_FORMAT_VERSION },
        fetch,
        checkWrite,
      );
      // The private index, for the review states' and answers' registrations of an instance registered elsewhere.
      let privateIndexElsewhere: string | null;
      try {
        const locations = await locateTypeIndexes(webId, fetch);
        const indexUrl =
          (registrationTarget === "private" ? locations.privateIndexUrl : locations.publicIndexUrl) ??
          (await createTypeIndex(registrationTarget, webId, url, fetch));
        privateIndexElsewhere = locations.privateIndexUrl === indexUrl ? null : locations.privateIndexUrl;
        await addRegistrations(
          indexUrl,
          { instanceUrl: url, title: name, classes: wantedIn(registrationTarget, true) },
          randomId,
          fetch,
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
            fetch,
          );
        } catch {
          // Left for Preferences to add.
        }
      }
      return { url, name };
    },

    async attachInstance({ webId, instanceUrl, registrationTarget }) {
      const url = ensureTrailingSlash(instanceUrl);
      const name = await readInstanceName(url, fetch);
      const indexUrl = await ensureTypeIndex(
        registrationTarget,
        webId,
        url,
        fetch,
      );
      await addRegistrations(indexUrl, { instanceUrl: url, title: name, classes: ["instance"] }, randomId, fetch);
      return { url, name };
    },

    async readDataClassRegistrations({ webId, instanceUrl }) {
      return registrationsOf(await indexesOf(webId, instanceUrl, fetch));
    },

    async registerDataClasses({ webId, instanceUrl, title }) {
      for (const index of (await indexesOf(webId, instanceUrl, fetch)).indexes) {
        const missing = index.wanted.filter((dataClass) => !index.registered.includes(dataClass));
        if (missing.length === 0) continue;
        await addRegistrations(index.url, { instanceUrl, title, classes: missing }, randomId, fetch);
      }
    },

    async renameRegistrations({ webId, instanceUrl, title }) {
      const { privateIndexUrl, publicIndexUrl } = await locateTypeIndexes(webId, fetch);
      for (const indexUrl of [privateIndexUrl, publicIndexUrl]) {
        if (indexUrl === null) continue;
        await renameInstanceRegistrations(indexUrl, { containerUrl: instanceUrl, title }, fetch);
      }
    },

    async readMeta(instanceUrl): Promise<InstanceMeta | null> {
      const metaUrl = metaUrlOf(instanceUrl);
      const dataset = await getSolidDatasetOrNull(metaUrl, fetch);
      if (dataset === null) return null;
      const subject = getThing(dataset, `${metaUrl}#it`);
      return subject === null ? null : toInstanceMeta(subject);
    },

    async saveMeta(instanceUrl, meta): Promise<void> {
      const metaUrl = metaUrlOf(instanceUrl);
      const dataset = await getSolidDatasetOrNull(metaUrl, fetch);
      const url = `${metaUrl}#it`;
      const existing = dataset === null ? null : getThing(dataset, url);
      if (dataset === null || existing === null) {
        throw new AppError("noMetaToUpdate", { url: instanceUrl });
      }
      const updated = setThing(dataset, toInstanceMetaThing(url, meta, existing));
      await checkWrite(updated, [url]);
      // If-Match the read above.
      await saveDataset(metaUrl, updated, fetch);
    },

    async upgradeMeta(instanceUrl): Promise<boolean> {
      const metaUrl = metaUrlOf(instanceUrl);
      const dataset = await getSolidDatasetOrNull(metaUrl, fetch);
      const url = `${metaUrl}#it`;
      const existing = dataset === null ? null : getThing(dataset, url);
      // The record as read, brought up to date in memory, written in this app's format.
      const meta = existing === null ? null : toInstanceMeta(existing);
      if (meta === null || !isInstanceOutdated(meta)) return false;
      const updated = setThing(dataset!, toInstanceMetaThing(url, meta, existing));
      await checkWrite(updated, [url]);
      // If-Match the read above.
      await saveDataset(metaUrl, updated, fetch);
      return true;
    },

    async deleteInstance({ webId, instance }) {
      const url = ensureTrailingSlash(instance.url);
      const deletion = await deleteInstanceData(url, fetch);
      const locations = await locateTypeIndexes(webId, fetch);
      for (const indexUrl of [
        locations.privateIndexUrl,
        locations.publicIndexUrl,
      ]) {
        if (indexUrl === null) continue;
        await removeInstanceRegistrations(indexUrl, url, fetch);
      }
      return deletion;
    },

    deleteInstanceData(instanceUrl) {
      return deleteInstanceData(instanceUrl, fetch);
    },
  };
}


/**
 * The classes of an instance's data that belong in a type index of a
 * kind: Solid Memo's own registration, the catalogue's, the decks' and
 * the cards' in each index that registers the instance (`holding`), and
 * the review states' and answers' in the private index only, whatever
 * index registers the instance.
 */
function wantedIn(kind: RegistrationTarget, holding: boolean): DataClass[] {
  return DATA_CLASSES.filter((dataClass) => (isPrivateOnly(dataClass) ? kind === "private" : holding));
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
 * Each type index there is, private first, with what it registers of the
 * instance's data and what belongs in it; one that cannot be read is
 * left out, and said to be unreadable.
 */
async function indexesOf(
  webId: string,
  instanceUrl: string,
  fetch: typeof globalThis.fetch,
): Promise<{ indexes: IndexRegistrations[]; privateIndexMissing: boolean; unreadableIndexes: RegistrationTarget[] }> {
  const { privateIndexUrl, publicIndexUrl } = await locateTypeIndexes(webId, fetch);
  const indexes: IndexRegistrations[] = [];
  const unreadableIndexes: RegistrationTarget[] = [];
  for (const [kind, url] of [
    ["private", privateIndexUrl],
    ["public", publicIndexUrl],
  ] as const) {
    if (url === null) continue;
    let registered: DataClass[];
    try {
      registered = await readRegisteredClasses(url, instanceUrl, fetch);
    } catch {
      unreadableIndexes.push(kind);
      continue;
    }
    indexes.push({ kind, url, registered, wanted: wantedIn(kind, registered.includes("instance")) });
  }
  return { indexes, privateIndexMissing: privateIndexUrl === null, unreadableIndexes };
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
        .map((index) => ({ dataClass, index: index.kind, registered: index.registered.includes(dataClass) })),
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
  const dataset = setThing(
    createSolidDataset(),
    toInstanceMetaThing(`${metaUrl}#it`, meta, null),
  );
  await checkWrite(dataset, [`${metaUrl}#it`]);
  await saveDataset(metaUrl, dataset, fetch);
}

async function readInstanceName(
  instanceUrl: string,
  fetch: typeof globalThis.fetch,
): Promise<string> {
  const metaUrl = metaUrlOf(instanceUrl);
  let dataset;
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

async function bestEffortCleanup(
  metaUrl: string,
  containerUrl: string,
  fetch: typeof globalThis.fetch,
): Promise<void> {
  try {
    await deleteSolidDataset(metaUrl, { fetch });
    await deleteContainer(containerUrl, { fetch });
  } catch {
  }
}
