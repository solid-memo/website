// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/** How a storage was discovered. */
export type StorageSource = "profile" | "linkHeader" | "manual";

/** A candidate storage root where Solid Memo instances can be created. */
export interface Storage {
  /** Container URL, always with a trailing slash. */
  url: string;
  /** How the storage was discovered. */
  source: StorageSource;
}
