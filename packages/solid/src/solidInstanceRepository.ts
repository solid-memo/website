import {
  createSolidDataset,
  deleteContainer,
  deleteSolidDataset,
  getThing,
  setThing,
} from "@inrupt/solid-client";
import type { InstanceRepository } from "@solid-memo/application/ports";
import {
  INSTANCE_FORMAT_VERSION,
  type Instance,
  type InstanceMeta,
} from "@solid-memo/domain/instance";
import { catalogNodeUrlOf, metaUrlOf } from "@solid-memo/domain/instanceLayout";
import { getSolidDatasetOrNull, readDataset, saveDataset } from "./datasets";
import { deleteInstanceData } from "./instanceData";
import { noWriteCheck, type WriteCheck } from "./writeCheck";
import {
  toInstance,
  toInstanceMeta,
  toInstanceMetaThing,
} from "./mappers/instanceMapper";
import {
  addCatalogRegistration,
  addInstanceRegistration,
  ensureTypeIndex,
  locateTypeIndexes,
  readInstanceRegistrations,
  removeInstanceRegistrations,
  switchInstanceRegistrations,
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
      try {
        const indexUrl = await ensureTypeIndex(
          registrationTarget,
          webId,
          url,
          fetch,
        );
        await addInstanceRegistration(
          indexUrl,
          { id: `sm-inst-${randomId()}`, containerUrl: url, title: name },
          fetch,
        );
        await addCatalogRegistration(
          indexUrl,
          { id: `sm-cat-${randomId()}`, catalogUrl: catalogNodeUrlOf(url), title: name },
          fetch,
        );
      } catch (error) {
        await bestEffortCleanup(metaUrl, url, fetch);
        throw error;
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
      const registrations = await readInstanceRegistrations(indexUrl, fetch);
      const alreadyRegistered = registrations.some(
        (registration) =>
          ensureTrailingSlash(registration.containerUrl) === url,
      );
      if (!alreadyRegistered) {
        await addInstanceRegistration(
          indexUrl,
          { id: `sm-inst-${randomId()}`, containerUrl: url, title: name },
          fetch,
        );
      }
      return { url, name };
    },

    async registerCatalog({ webId, instanceUrl, title }) {
      const url = ensureTrailingSlash(instanceUrl);
      const locations = await locateTypeIndexes(webId, fetch);
      for (const indexUrl of [locations.privateIndexUrl, locations.publicIndexUrl]) {
        if (indexUrl === null) continue;
        const registrations = await readRegistrationsSafely(indexUrl, fetch);
        if (!registrations.some((r) => ensureTrailingSlash(r.containerUrl) === url)) continue;
        await addCatalogRegistration(
          indexUrl,
          { id: `sm-cat-${randomId()}`, catalogUrl: catalogNodeUrlOf(url), title },
          fetch,
        );
      }
    },

    async switchInstance({ webId, from, to, title }) {
      const { privateIndexUrl, publicIndexUrl } = await locateTypeIndexes(webId, fetch);
      const catalogId = `sm-cat-${randomId()}`;
      const switched: string[] = [];
      try {
        for (const indexUrl of [privateIndexUrl, publicIndexUrl]) {
          if (indexUrl === null) continue;
          if (await switchInstanceRegistrations(indexUrl, { from, to, title, catalogId }, fetch)) {
            switched.push(indexUrl);
          }
        }
      } catch (error) {
        for (const indexUrl of switched) {
          await switchInstanceRegistrations(indexUrl, { from: to, to: from, title, catalogId }, fetch).catch(
            () => undefined,
          );
        }
        throw error;
      }
      if (switched.length === 0) {
        throw new AppError("notRegistered", { url: from });
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
      await saveDataset(metaUrl, updated, fetch);
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
