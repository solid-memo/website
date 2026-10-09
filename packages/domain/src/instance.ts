import { LATEST_VERSION } from "@solid-memo/vocab/types.generated";

/** One Solid Memo data location (a container in a pod). */
export interface Instance {
  /** Container URL with trailing slash. The instance's identity. */
  url: string;
  name: string;
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
   * For an instance made by a format update: the container it replaced,
   * kept in the pod as a backup until the user restores or deletes it.
   */
  replaces?: string;
  /** When it replaced that container (ISO dateTime). */
  replacedAt?: string;
}

/** Which type index an instance is (or will be) registered in. */
export type RegistrationTarget = "private" | "public";

export interface RegistrationOptions {
  privateIndexExists: boolean;
  publicIndexExists: boolean;
}

/**
 * What deleting an instance's data left (docs/data-model.md "Deleting an
 * instance"): only what Solid Memo wrote is deleted, so a folder that
 * also holds what another app put there is kept.
 */
export interface InstanceDeletion {
  /** The instance's folder, when it was kept for what else it holds; null when it is gone. */
  keptFolder: string | null;
}
