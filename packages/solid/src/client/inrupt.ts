// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type {
  SolidDataset,
  Thing,
  WithResourceInfo,
  WithServerResourceInfo,
} from "@inrupt/solid-client";
import type { Dataset, FetchedDataset, SourcedDataset, Subject } from "./interface";

/**
 * The library's objects behind the interface's types (interface.ts), for
 * the client modules alone. Every dataset and subject they give out is
 * one @inrupt/solid-client made, so each is handed back to it as it is.
 */

/** The library's dataset behind one of ours. */
export function solidDataset(dataset: Dataset): SolidDataset {
  return dataset as SolidDataset;
}

/** The library's dataset behind one of ours that knows its document. */
export function sourcedDataset(dataset: SourcedDataset): SolidDataset & WithResourceInfo {
  return dataset as unknown as SolidDataset & WithResourceInfo;
}

/** The library's dataset behind one of ours as read from a pod, with what the server said of it. */
export function serverDataset(dataset: FetchedDataset): SolidDataset & WithServerResourceInfo {
  return dataset as unknown as SolidDataset & WithServerResourceInfo;
}

/** A dataset the library read or wrote, as ours. */
export function fetchedDataset(dataset: SolidDataset & WithServerResourceInfo): FetchedDataset {
  return dataset as unknown as FetchedDataset;
}

/** A dataset the library made of `dataset`, as the same kind of ours: the library keeps what it knew of its document. */
export function likeDataset<T extends Dataset>(_dataset: T, made: SolidDataset): T {
  return made as unknown as T;
}

/** The library's subject behind one of ours. */
export function thing(subject: Subject): Thing {
  return subject as Thing;
}
