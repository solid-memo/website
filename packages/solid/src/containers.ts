// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  deleteContainer,
  deleteFile,
  getContainedResourceUrlAll,
  getSolidDataset,
} from "./client/resources";
import type { SourcedDataset } from "./client/rdf";
import { getSolidDatasetOrNull } from "./datasets";
import { AppError } from "@solid-memo/domain/appError";

/**
 * Containers as trees of resources: listing what one holds, or
 * everything below it, deleting it whole, and deleting one only when it
 * is empty. Solid lists a container's direct children only and deletes
 * only empty containers, so listing everything and deleting it whole
 * walk the tree. Each follows only children whose URL lies below the
 * container, so a strange listing can never lead it (or a copy or a
 * delete) outside it.
 */

/** What a container lists that lies below it. */
function childrenOf(container: SourcedDataset, containerUrl: string): string[] {
  return getContainedResourceUrlAll(container).filter(
    (child) => child.startsWith(containerUrl) && child !== containerUrl,
  );
}

/** What a container holds, its direct children only; containers end with a slash. None when it is gone. */
export async function listContainer(
  containerUrl: string,
  fetch: typeof globalThis.fetch,
): Promise<string[]> {
  const container = await getSolidDatasetOrNull(containerUrl, fetch);
  return container === null ? [] : childrenOf(container, containerUrl);
}

/**
 * The most resources, containers among them, a walk of everything below
 * a container (listing it, or deleting it whole) takes in, and the most
 * levels of containers below it that it reads. A listing is data anyone
 * with write access, or the server of an instance someone else hosts,
 * may have written: one with no end would otherwise be read on and on.
 * Only a guest's study moved is walked, and an instance of Solid Memo's
 * holds far fewer: two documents a deck, its drafts' documents
 * (MAX_DRAFT_DOCUMENTS_IN_ALL), its answer log's months and a few
 * others, at most three levels deep (`drafts/<name>/v<N>/`).
 */
const MAX_TREE_RESOURCES = 20_000;
const MAX_TREE_DEPTH = 8;

/**
 * A walk's budget: each resource it takes in is counted, and each
 * container it reads may be no deeper than MAX_TREE_DEPTH. Past either,
 * the walk is refused (guestStudyTooLarge), not read on.
 */
function treeBudget() {
  let taken = 0;
  return {
    take(): void {
      if (taken === MAX_TREE_RESOURCES) throw new AppError("guestStudyTooLarge");
      taken += 1;
    },
    enter(level: number): void {
      if (level > MAX_TREE_DEPTH) throw new AppError("guestStudyTooLarge");
    },
  };
}

/**
 * Every resource below a container, depth first; containers end with a
 * slash. None when it is gone. Bounded by a walk's budget (treeBudget).
 */
export async function listContainerTree(
  containerUrl: string,
  fetch: typeof globalThis.fetch,
): Promise<string[]> {
  const budget = treeBudget();
  const resources: string[] = [];
  const walk = async (url: string, level: number): Promise<void> => {
    budget.enter(level);
    for (const child of (await listContainer(url, fetch)).sort()) {
      budget.take();
      resources.push(child);
      if (child.endsWith("/")) await walk(child, level + 1);
    }
  };
  await walk(containerUrl, 1);
  return resources;
}

/**
 * Delete a container and everything below it: children first, an
 * instance's meta.ttl last, so a partly deleted copy still attaches by
 * URL. A container that is already gone counts as deleted. Only for a
 * container Solid Memo made whole, a copy of an instance (the format
 * update's, the guest's study moved), where every resource is its own; an
 * instance is deleted by what it holds of Solid Memo's (instanceData.ts).
 * Bounded by a walk's budget (treeBudget), as listing it is.
 */
export async function deleteContainerRecursively(
  containerUrl: string,
  fetch: typeof globalThis.fetch,
): Promise<void> {
  const budget = treeBudget();
  const remove = async (url: string, level: number): Promise<void> => {
    budget.enter(level);
    const container = await getSolidDatasetOrNull(url, fetch);
    if (container === null) return;
    // Only what lies below the container: a listing naming anything else is not followed.
    const children = childrenOf(container, url).sort(
      (a, b) => Number(isMetaDocument(a)) - Number(isMetaDocument(b)),
    );
    for (const child of children) {
      budget.take();
      if (child.endsWith("/")) await remove(child, level + 1);
      else await deleteFile(child, { fetch });
    }
    await deleteContainer(url, { fetch });
  };
  await remove(containerUrl, 1);
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
  let container: SourcedDataset;
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
