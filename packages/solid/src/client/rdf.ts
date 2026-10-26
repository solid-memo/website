// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type {
  SolidDataset,
  Thing,
  ThingBuilder,
  ThingPersisted,
  WithResourceInfo,
  WithServerResourceInfo,
} from "@inrupt/solid-client";

/**
 * The app's RDF data model: datasets of subjects, read and built with the
 * operations below. A thin layer over @inrupt/solid-client, the only
 * implementation so far, so that the rest of the package names no
 * library: a switch of libraries changes this module, not its callers.
 * The operations keep the names the library gives them.
 */

/** A document's triples, as read from a pod or built to be written. */
export type Dataset = SolidDataset;

/** The triples of one subject of a dataset, by a URL or local to it. */
export type Subject = Thing;

/** A subject with a URL of its own. */
export type NamedSubject = ThingPersisted;

/** Adds a subject's triples one call at a time (buildThing). */
export type SubjectBuilder = ThingBuilder<ThingPersisted>;

/** A dataset that knows the document it came from (getSourceUrl). */
export type SourcedDataset = Dataset & WithResourceInfo;

/** A dataset as read from a pod, with what the server said of it. */
export type FetchedDataset = Dataset & WithServerResourceInfo;

export {
  asUrl,
  buildThing,
  createSolidDataset,
  createThing,
  fromRdfJsDataset,
  getBoolean,
  getDatetime,
  getDecimal,
  getInteger,
  getLiteralAll,
  getPropertyAll,
  getStringByLocaleAll,
  getStringNoLocale,
  getStringNoLocaleAll,
  getTermAll,
  getThing,
  getThingAll,
  getUrl,
  getUrlAll,
  removeThing,
  removeUrl,
  setThing,
  toRdfJsDataset,
} from "@inrupt/solid-client";
