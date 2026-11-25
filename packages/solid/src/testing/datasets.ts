// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { DocumentRead, DocumentWrite } from "@solid-memo/solid-client/interface";
import {
  type Dataset,
  datasetAt,
  type FetchedDataset,
  eachStringByLocale,
  eachStringNoLocale,
  type Subject,
  withQuads,
} from "@solid-memo/solid-client/rdf";
import { parseQuads } from "@solid-memo/solid-client/resources";

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

/** A write as a test's pod takes it: the dataset as given, saved with no version (writeDocument). */
export async function writtenAsGiven(_url: string, dataset: Dataset): Promise<DocumentWrite> {
  return { dataset: dataset as FetchedDataset, etag: undefined };
}

/** A read of `dataset` as a test's pod gives it, with no version (readDocument). */
export function readOf(dataset: Dataset): DocumentRead {
  return { dataset: dataset as FetchedDataset, etag: undefined };
}

/** Every string without a language a subject has for a property, in stored order (eachStringNoLocale). */
export function getStringNoLocaleAll(subject: Subject, property: string): string[] {
  return [...eachStringNoLocale(subject, property)];
}

/** A subject's strings with a language for a property, by their language in lower case (eachStringByLocale). */
export function getStringByLocaleAll(subject: Subject, property: string): Map<string, string[]> {
  const strings = new Map<string, string[]>();
  for (const [language, value] of eachStringByLocale(subject, property)) {
    strings.set(language, [...(strings.get(language) ?? []), value]);
  }
  return strings;
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
