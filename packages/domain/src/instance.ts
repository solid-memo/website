// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { LATEST_VERSION } from "@solid-memo/vocab/types.generated";
import { AppError } from "./appError";

/** One Solid Memo data location (a container in a pod). */
export interface Instance {
  /** Container URL with trailing slash. The instance's identity. */
  url: string;
  name: string;
}

/** An instance's name as the user typed it, trimmed; an empty one is refused (instanceNameEmpty). */
export function instanceName(typed: string): string {
  const name = typed.trim();
  if (name === "") throw new AppError("instanceNameEmpty");
  return name;
}

/** Format version written on every instance meta document this app creates. */
export const INSTANCE_FORMAT_VERSION: number = LATEST_VERSION.instance;

/** What an instance's meta document says about it. */
export interface InstanceMeta {
  name: string;
  /** ISO dateTime. */
  createdAt: string;
  formatVersion: number;
  /**
   * For an instance a format update by an earlier version of the app
   * made, as a copy: the container it replaced (dcterms:replaces). The
   * app does nothing with it; it is read only so that a write of the
   * meta document keeps it, as it keeps any triple.
   */
  replaces?: string;
  /** When it replaced that container (dcterms:modified, ISO dateTime); kept likewise. */
  replacedAt?: string;
}

/** Which type index an instance is (or will be) registered in. */
export type RegistrationTarget = "private" | "public";

export interface RegistrationOptions {
  privateIndexExists: boolean;
  publicIndexExists: boolean;
}

/**
 * What a removal of Solid Memo's data kept of the documents it went
 * through (docs/data-model.md "Write discipline"): only what Solid Memo
 * wrote is removed from each, so one that also holds another app's data
 * is kept with that.
 */
export interface KeptDocuments {
  /** The documents kept for another app's data in them, by URL; empty when none was. */
  keptDocuments: string[];
}

/**
 * What deleting an instance's data left (docs/data-model.md "Deleting an
 * instance"): only what Solid Memo wrote is deleted, so a folder that
 * also holds what another app put there is kept, and so is one that
 * holds the releases published from the instance, and a document that
 * also holds another app's data (KeptDocuments).
 */
export interface InstanceDeletion extends KeptDocuments {
  /** The instance's folder, when it was kept for what else it holds; null when it is gone. */
  keptFolder: string | null;
  /** Whether what the kept folder holds includes the releases published from the instance (`releases/`), which are kept. */
  keptReleases: boolean;
}
