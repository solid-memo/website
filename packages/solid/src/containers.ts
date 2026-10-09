import {
  deleteContainer,
  deleteFile,
  getContainedResourceUrlAll,
  getSolidDataset,
} from "@inrupt/solid-client";
import { getSolidDatasetOrNull } from "./datasets";

/**
 * Containers as trees of resources: listing everything below one,
 * deleting it whole, and deleting one only when it is empty. Solid lists
 * a container's direct children only and deletes only empty containers,
 * so the first two walk the tree. Each follows only children whose URL
 * lies below the container, so a strange listing can never lead it (or a
 * copy or a delete) outside it.
 */

/** What a container lists that lies below it. */
function childrenOf(container: Parameters<typeof getContainedResourceUrlAll>[0], containerUrl: string): string[] {
  return getContainedResourceUrlAll(container).filter(
    (child) => child.startsWith(containerUrl) && child !== containerUrl,
  );
}

/** Every resource below a container, depth first; containers end with a slash. None when it is gone. */
export async function listContainerTree(
  containerUrl: string,
  fetch: typeof globalThis.fetch,
): Promise<string[]> {
  const container = await getSolidDatasetOrNull(containerUrl, fetch);
  if (container === null) return [];
  const resources: string[] = [];
  for (const child of childrenOf(container, containerUrl).sort()) {
    resources.push(child);
    if (child.endsWith("/")) resources.push(...(await listContainerTree(child, fetch)));
  }
  return resources;
}

/**
 * Delete a container and everything below it: children first, an
 * instance's meta.ttl last, so a partly deleted copy still attaches by
 * URL. A container that is already gone counts as deleted. Only for a
 * container Solid Memo made whole, a copy of an instance (the format
 * update's, the guest's study moved), where every resource is its own; an
 * instance is deleted by what it holds of Solid Memo's (instanceData.ts).
 */
export async function deleteContainerRecursively(
  containerUrl: string,
  fetch: typeof globalThis.fetch,
): Promise<void> {
  const container = await getSolidDatasetOrNull(containerUrl, fetch);
  if (container === null) return;
  // Only what lies below the container: a listing naming anything else is not followed.
  const children = childrenOf(container, containerUrl).sort(
    (a, b) => Number(isMetaDocument(a)) - Number(isMetaDocument(b)),
  );
  for (const child of children) {
    if (child.endsWith("/")) {
      await deleteContainerRecursively(child, fetch);
    } else {
      await deleteFile(child, { fetch });
    }
  }
  await deleteContainer(containerUrl, { fetch });
}

function isMetaDocument(url: string): boolean {
  return url.endsWith("/meta.ttl");
}

/**
 * Delete a container if it holds nothing; whether it is gone (one already
 * gone is). Its listing is read afresh, never answered from what was read
 * before, as its children were just deleted; a container that gains a
 * child between the listing and the delete is refused by the pod (409),
 * and kept.
 */
export async function deleteContainerIfEmpty(
  containerUrl: string,
  fetch: typeof globalThis.fetch,
): Promise<boolean> {
  let container: Parameters<typeof getContainedResourceUrlAll>[0];
  try {
    container = await getSolidDataset(containerUrl, { fetch });
  } catch (error) {
    if (statusOf(error) === 404) return true;
    throw error;
  }
  if (childrenOf(container, containerUrl).length > 0) return false;
  try {
    await deleteContainer(containerUrl, { fetch });
  } catch (error) {
    if (statusOf(error) === 409) return false;
    throw error;
  }
  return true;
}

function statusOf(error: unknown): number | undefined {
  return (error as { statusCode?: number }).statusCode;
}
