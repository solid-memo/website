// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ResourceStore } from "@solid-memo/application/ports";
import { RDF, SM, SM_NS } from "../vocab";

/**
 * Data as a later version of Solid Memo may add it to a pod, in the ways
 * the versioning policy allows (docs/vocab.md): a term outside every
 * shape on each subject, a subject of a new class in each document, and
 * a review state of a new scheduler beside each state. Each is a term
 * of Solid Memo's vocabulary that this app's copy of it does not have.
 * This app knows none of it, and its writes are to keep all of it
 * (writes.preserve.test.ts).
 */

/** Terms a later version of the vocabulary has: a property, a class, a scheduler and its property. */
export const LATER = {
  note: `${SM_NS}laterNote`,
  Thing: `${SM_NS}LaterThing`,
  of: `${SM_NS}laterOf`,
  scheduler: `${SM_NS}laterScheduler`,
  memory: `${SM_NS}laterMemory`,
} as const;

const XSD = "http://www.w3.org/2001/XMLSchema#";

/** What a seed is: a term on a subject the app knows, or a statement of a subject it does not. */
export type SeedKind = "term" | "thing" | "state";

/** One statement seeded: where it is, what it is about, and its line. */
export interface Seed {
  kind: SeedKind;
  document: string;
  subject: string;
  /** The statement as an N-Triples line. */
  line: string;
}

/** The subject a line is about; undefined for a blank node's. */
function subjectOf(line: string): string | undefined {
  return /^<([^>]*)> /.exec(line)?.[1];
}

/** The lines that say `subject` is of `type`. */
function typed(lines: readonly string[], type: string): Set<string> {
  const stated = ` <${RDF.type}> <${type}> .`;
  return new Set(lines.filter((line) => line.endsWith(stated)).map((line) => subjectOf(line)!));
}

/** The subject of a new class a document gets. */
export function laterThingOf(document: string): string {
  return `${document}#later-thing`;
}

/** The state of a new scheduler a review state gets beside it. */
export function laterStateOf(state: string): string {
  return `${state}@later`;
}

/**
 * The seeds of one document's lines:
 *
 * - on each subject with an IRI, a term, but for a color
 *   set, whose shape is closed, and for what the digest holds, which
 *   is worked out from the rest and written anew when that changes;
 * - a subject of a new class, which links to the document's first
 *   subject;
 * - beside each SM-2 review state, a state of a new scheduler, of the
 *   same card and direction.
 */
export function seedsOf(document: string, lines: readonly string[]): Seed[] {
  const seeds: Seed[] = [];
  const seed = (kind: SeedKind, subject: string, rest: string) =>
    seeds.push({ kind, document, subject, line: `<${subject}> ${rest} .` });
  const closed = new Set(
    [SM.ColorSet, SM.DocumentReceipt, SM.DeckSchedule].flatMap((type) => [...typed(lines, type)]),
  );
  const subjects = [...new Set(lines.map(subjectOf))].filter(
    (subject): subject is string => subject !== undefined,
  );
  for (const subject of subjects) {
    if (closed.has(subject)) continue;
    seed("term", subject, `<${LATER.note}> "kept"`);
  }
  if (subjects.length > 0) {
    const thing = laterThingOf(document);
    seed("thing", thing, `<${RDF.type}> <${LATER.Thing}>`);
    seed("thing", thing, `<${LATER.of}> <${subjects[0]}>`);
    seed("thing", thing, `<${SM.formatVersion}> "1"^^<${XSD}integer>`);
  }
  const sm2 = ` <${SM.scheduler}> <${SM.sm2}> .`;
  for (const state of lines.filter((line) => line.endsWith(sm2)).map((line) => subjectOf(line)!)) {
    const later = laterStateOf(state);
    seed("state", later, `<${RDF.type}> <${SM.ReviewState}>`);
    seed("state", later, `<${SM.scheduler}> <${LATER.scheduler}>`);
    for (const property of [SM.reviewOf, SM.reviewDirection, SM.due, SM.lastReviewedAt]) {
      const stated = lines.find((line) => line.startsWith(`<${state}> <${property}> `));
      if (stated !== undefined) seed("state", later, stated.slice(`<${state}> `.length, -2));
    }
    seed("state", later, `<${LATER.memory}> "1.5"^^<${XSD}decimal>`);
    seed("state", later, `<${SM.formatVersion}> "1"^^<${XSD}integer>`);
  }
  return seeds;
}

/** Seeds every RDF document of a store (seedsOf), in place, and returns the seeds. */
export async function seed(store: ResourceStore): Promise<Seed[]> {
  const seeds: Seed[] = [];
  for (const url of await store.urls()) {
    const resource = await store.get(url);
    if (resource?.kind !== "rdf") continue;
    const added = seedsOf(url, resource.triples);
    for (const one of added) seeds.push(one);
    await store.set(url, {
      ...resource,
      triples: [...resource.triples, ...added.map(({ line }) => line)],
      etag: `"seeded-${seeds.length}"`,
    });
  }
  return seeds;
}

/** The seeds that are no longer in the store as they were seeded. */
export async function missing(store: ResourceStore, seeds: readonly Seed[]): Promise<Seed[]> {
  const held = new Map<string, Set<string>>();
  for (const { document } of seeds) {
    if (held.has(document)) continue;
    const resource = await store.get(document);
    held.set(document, new Set(resource?.kind === "rdf" ? resource.triples : []));
  }
  return seeds.filter(({ document, line }) => !held.get(document)!.has(line));
}
