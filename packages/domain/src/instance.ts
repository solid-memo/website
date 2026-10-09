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
 * What deleting an instance's data left (docs/data-model.md "Deleting an
 * instance"): only what Solid Memo wrote is deleted, so a folder that
 * also holds what another app put there is kept.
 */
export interface InstanceDeletion {
  /** The instance's folder, when it was kept for what else it holds; null when it is gone. */
  keptFolder: string | null;
}

/**
 * The kinds of an instance's data registered in the type indexes, one
 * class each (docs/data-model.md "Discovery chain"): the instance
 * itself, its catalogue, its decks, cards, review states and answers.
 */
export const DATA_CLASSES = ["instance", "catalog", "deck", "card", "reviewState", "answer"] as const;
export type DataClass = (typeof DATA_CLASSES)[number];

/**
 * Review states and answers say what the user studied, and how well:
 * they are registered in the private type index only, never in the
 * public one, even for an instance registered publicly.
 */
export function isPrivateOnly(dataClass: DataClass): boolean {
  return dataClass === "reviewState" || dataClass === "answer";
}

/** One registration an instance's data has, or is missing, in one type index. */
export interface DataClassRegistration {
  dataClass: DataClass;
  index: RegistrationTarget;
  registered: boolean;
}

/** The registrations an instance's data has and is missing, by class. */
export interface DataClassRegistrations {
  /** In DATA_CLASSES order, the private index's before the public one's. */
  registrations: DataClassRegistration[];
  /** No private type index: review states and answers, which go only there, are not registered. */
  privateIndexMissing: boolean;
  /** The type indexes the profile links that could not be read: what they register is not known, and nothing is added to them. */
  unreadableIndexes: RegistrationTarget[];
}
