// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ReadLimits } from "./client/interface";
import { limitedFetch } from "./client/readLimits";
import { ensureTrailingSlash } from "./urls";

/**
 * How a Linked Web Storage (LWS) server names its storages
 * (docs/lws.md): every answer to a GET or HEAD links the storage the
 * resource is in, with this relation, and the storage's URI answers
 * with its storage description, which names the storage's root
 * container as its StorageRoot service. The Solid Protocol's
 * `pim:Storage` type is not part of LWS.
 */
export const LWS_STORAGE_REL = "https://www.w3.org/ns/lws#storage";

/** The media type of an LWS storage description (a Controlled Identifier document). */
export const LWS_DESCRIPTION_TYPE = "application/lws+cid";

/** A storage description names a few services; it is read under these limits, far below a profile's. */
const DESCRIPTION_LIMITS: ReadLimits = { bytes: 64 * 1024, quads: 0, characters: 64 * 1024 };

const STORAGE_TYPES = new Set(["Storage", "https://www.w3.org/ns/lws#Storage"]);
const STORAGE_ROOT_TYPES = new Set(["StorageRoot", "https://www.w3.org/ns/lws#StorageRoot"]);

/** A JSON-LD `type`, a string or a list of them, as a list. */
function typesOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * The root containers of the storage at `storage`, as its storage
 * description lists them (its StorageRoot services), each with a
 * trailing slash; null when it answers no description, a description
 * of another storage (its `id` must be the storage's URI), or one that
 * is not one. A root on another origin than the storage's is left out,
 * and so is one that is no URL: the app treats a storage's root as
 * part of the server it asked.
 */
export async function storageRootsOf(
  storage: string,
  fetch: typeof globalThis.fetch,
): Promise<string[] | null> {
  let description: unknown;
  try {
    const response = await limitedFetch(fetch, DESCRIPTION_LIMITS)(storage, {
      headers: { Accept: LWS_DESCRIPTION_TYPE },
    });
    if (!response.ok) return null;
    description = JSON.parse(await response.text());
  } catch {
    return null;
  }
  if (typeof description !== "object" || description === null) return null;
  const { id, type, service } = description as Record<string, unknown>;
  if (typeof id !== "string" || !URL.canParse(id, storage)) return null;
  if (new URL(id, storage).href !== new URL(storage).href) return null;
  if (!typesOf(type).some((one) => STORAGE_TYPES.has(one as string))) return null;
  if (!Array.isArray(service)) return null;
  const roots = service
    .filter((one): one is Record<string, unknown> => typeof one === "object" && one !== null)
    .filter((one) => typesOf(one.type).some((each) => STORAGE_ROOT_TYPES.has(each as string)))
    .map((one) => one.serviceEndpoint)
    .filter(
      (endpoint): endpoint is string =>
        typeof endpoint === "string" && URL.canParse(endpoint, storage),
    )
    .map((endpoint) => ensureTrailingSlash(new URL(endpoint, storage).href))
    .filter((root) => new URL(root).origin === new URL(storage).origin);
  return [...new Set(roots)];
}
