// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  datasetAt,
  type FetchedDataset,
  getStringByLocaleAll,
  type Subject,
  withQuads,
} from "../client/rdf";
import { parseQuads } from "../client/resources";

/**
 * Datasets for tests, as a pod gives them: read from a document, so that
 * they know their source (sourceOf, getSourceUrl), subjects made by name
 * resolve against it, and a save of them is a PATCH of their changes.
 * Built through the app's RDF module, so they are what the library in
 * use reads.
 */

/** The document at `url`, read empty. */
export function datasetFrom(url: string): FetchedDataset {
  return datasetAt(url);
}

/** The container at `url`, read empty; its URL ends in a slash. */
export function containerFrom(url: string): FetchedDataset {
  if (!url.endsWith("/")) throw new Error(`A container's URL ends in a slash: ${url}`);
  return datasetAt(url);
}

/** The document at `url`, read as holding `turtle`. */
export async function datasetOfTurtle(url: string, turtle: string): Promise<FetchedDataset> {
  return withQuads(datasetFrom(url), await parseQuads(turtle, "turtle", url));
}

/** A subject's strings of a property in `locale` (any case). */
export function getStringWithLocaleAll(
  subject: Subject,
  property: string,
  locale: string,
): string[] {
  return getStringByLocaleAll(subject, property).get(locale.toLowerCase()) ?? [];
}

/** The first of a subject's strings of a property in `locale`, or null. */
export function getStringWithLocale(
  subject: Subject,
  property: string,
  locale: string,
): string | null {
  return getStringWithLocaleAll(subject, property, locale)[0] ?? null;
}
