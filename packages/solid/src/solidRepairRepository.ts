// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  type Dataset,
  type NamedSubject,
  buildThing,
  getInteger,
  getStringNoLocale,
  getThingAll,
  getUrlAll,
  removeThings,
} from "./client/rdf";
import type { RepairRepository } from "@solid-memo/application/ports";
import { defaultDeckDescription, defaultDeckDescriptionText } from "@solid-memo/domain/dcat";
import type { Repair, RepairKind } from "@solid-memo/domain/repair";
import { isStudyDay } from "@solid-memo/domain/reviewStateEdits";
import { type DatasetEdit, editOf } from "./datasetEdit";
import { getSolidDatasetOrNull, saveDataset } from "./datasets";
import { foreignSubjects } from "./ownership";
import { readDatetime, readText, unlessNewer, unreadableDatetimes, XSD_DATETIME } from "./records";
import { DCAT, DCTERMS, RDF, SM } from "./vocab";

const FOAF_NAME = "http://xmlns.com/foaf/0.1/name";

const SNAPSHOT = [
  SM.previousEaseFactor,
  SM.previousIntervalDays,
  SM.previousRepetitions,
  SM.previousDue,
  SM.previousLastReviewedAt,
];
/** An FSRS-6 state's snapshot: the four previous* terms it writes. */
const FSRS_SNAPSHOT = [
  SM.previousStability,
  SM.previousDifficulty,
  SM.previousDue,
  SM.previousLastReviewedAt,
];

/**
 * Repairs written to the pod (see docs/validation.md): each document is
 * read once, every repair of its subjects applied in one edit, and
 * written once. A repair only fills in or removes what its problem is
 * about, so what else a subject says survives; a subject that is gone
 * is skipped.
 */
export function createSolidRepairRepository({
  fetch,
}: {
  fetch: typeof globalThis.fetch;
}): RepairRepository {
  return {
    async applyRepairs(repairs) {
      for (const [documentUrl, ofDocument] of byDocument(repairs)) {
        const dataset = await getSolidDatasetOrNull(documentUrl, fetch);
        if (dataset === null) continue;
        await saveDataset(documentUrl, repaired(dataset, documentUrl, ofDocument), fetch);
      }
    },
  };
}

/** The repairs of each document, in the order their documents first come. */
function byDocument(repairs: readonly Repair[]): Map<string, Repair[]> {
  const documents = new Map<string, Repair[]>();
  for (const repair of repairs) {
    const ofDocument = documents.get(repair.documentUrl);
    if (ofDocument === undefined) documents.set(repair.documentUrl, [repair]);
    else ofDocument.push(repair);
  }
  return documents;
}

/**
 * The links that make a deck or deck group a member of a catalog or
 * group, and the classes of what they link to: the DCAT class, or the
 * Solid Memo one alone (a deck that lost its DCAT class is still listed,
 * so the catalog keeps listing every deck).
 */
const MEMBERSHIP = [
  { link: DCAT.dataset, types: [DCAT.Dataset, SM.Deck] },
  { link: DCAT.catalog, types: [DCAT.Catalog, SM.DeckGroup] },
];

/**
 * The document with its repairs applied in turn, each to the subject as
 * the repairs before it left it, in one edit of the document (editOf)
 * and one removal of the subjects removed (removeThings): many repairs
 * take time that grows with them and the document, where a setThing or
 * removeThing at each would copy the whole document every time, in the
 * square of its subjects. A removal makes the other apps' subjects be
 * found again at the next drop-dangling-members repair, so the two
 * kinds alternating in one call take longer; the instance check never
 * plans a removal, and each removal the user confirms comes alone.
 */
function repaired(dataset: Dataset, documentUrl: string, repairs: readonly Repair[]): Dataset {
  const edit = editOf(dataset);
  // The subjects removed, by their URLs, and the URLs their repairs named them by.
  const removed = new Map<string, NamedSubject>();
  const unlinked = new Set<string>();
  const current = (url: string) => {
    const thing = edit.getThing(url);
    return thing === null || removed.has(thing.url) ? null : thing;
  };
  // Another app's subjects change only with a removal (a deck's creator is
  // Solid Memo's while the deck names it), so they are found again after one.
  let foreign: Set<string> | null = null;
  const foreignNow = () => (foreign ??= foreignSubjects(removeThings(dataset, removed.values())));
  for (const repair of repairs) {
    const thing = current(repair.subjectUrl);
    if (thing === null) continue;
    // A repair is of what this version found: never of a subject a newer one has written since.
    unlessNewer(thing);
    if (repair.kind === "remove-subject") {
      removed.set(thing.url, thing);
      unlinked.add(repair.subjectUrl);
      foreign = null;
    } else if (repair.kind === "drop-dangling-members") {
      edit.setThing(withoutDanglingMembers(current, foreignNow(), documentUrl, thing));
    } else {
      edit.setThing(repairedThing(thing, { ...repair, kind: repair.kind }));
    }
  }
  if (unlinked.size > 0) {
    for (const { url } of getThingAll(dataset)) {
      const parent = current(url);
      if (parent !== null) withoutMembershipsOf(edit, documentUrl, parent, unlinked);
    }
  }
  return removeThings(edit.done(), removed.values());
}

/**
 * A removed subject is no member of the catalog (`#catalog`) or of a
 * deck group any more. Only those links go: who else names it — a deck
 * its creator, the catalog its publisher — is left as it is. Every
 * removed subject's links go at once, a parent set once however many
 * of its members are removed.
 */
function withoutMembershipsOf(
  edit: DatasetEdit<Dataset>,
  documentUrl: string,
  parent: NamedSubject,
  unlinked: ReadonlySet<string>,
): void {
  if (
    parent.url !== `${documentUrl}#catalog` &&
    !getUrlAll(parent, RDF.type).includes(SM.DeckGroup)
  )
    return;
  const links = MEMBERSHIP.filter(({ link }) =>
    getUrlAll(parent, link).some((url) => unlinked.has(url)),
  );
  if (links.length === 0) return;
  edit.setThing(withoutLinks(parent, links, unlinked));
}

/**
 * The parent without its `links` to the subjects in `unlinked`: each
 * link's other values set at once, in time that grows with them.
 * setIriAll writes each again and refuses one the library takes for no
 * URL, which another app may have written; then only the removed
 * subjects' links are taken out, one at a time, and every other value
 * stays as it is.
 */
function withoutLinks(
  parent: NamedSubject,
  links: readonly { link: string }[],
  unlinked: ReadonlySet<string>,
): NamedSubject {
  try {
    return links
      .reduce(
        (builder, { link }) =>
          builder.setIriAll(
            link,
            getUrlAll(parent, link).filter((url) => !unlinked.has(url)),
          ),
        buildThing(parent),
      )
      .build();
  } catch {
    return links
      .reduce(
        (builder, { link }) =>
          getUrlAll(parent, link)
            .filter((url) => unlinked.has(url))
            .reduce((next, url) => next.removeUrl(link, url), builder),
        buildThing(parent),
      )
      .build();
  }
}

/**
 * A catalog or deck group without its links to subjects of its own
 * document that the document does not describe as decks or groups. A
 * member in another document (a dataset another app listed) is described
 * there, and its link stays, as does one another app described in this
 * document, whatever its class.
 */
function withoutDanglingMembers(
  current: (url: string) => NamedSubject | null,
  foreign: ReadonlySet<string>,
  documentUrl: string,
  thing: NamedSubject,
): NamedSubject {
  const describes = (url: string, types: string[]) => {
    const member = current(url);
    return (
      member !== null &&
      (foreign.has(url) || getUrlAll(member, RDF.type).some((type) => types.includes(type)))
    );
  };
  // Each link's members kept set in one call (setIriAll), however many it has.
  return MEMBERSHIP.reduce(
    (builder, { link, types }) =>
      builder.setIriAll(
        link,
        getUrlAll(thing, link).filter(
          (url) => !url.startsWith(`${documentUrl}#`) || describes(url, types),
        ),
      ),
    buildThing(thing),
  ).build();
}

function repairedThing(
  thing: NamedSubject,
  repair: Repair & { kind: Exclude<RepairKind, "remove-subject" | "drop-dangling-members"> },
): NamedSubject {
  const builder = buildThing(thing);
  switch (repair.kind) {
    case "describe-deck": {
      // Format 4 states text language-tagged, the app's own in English and
      // Swedish; from format 5 the title may be in any language, so it is read in every one.
      if (repair.version >= 4) {
        const description = defaultDeckDescriptionText(
          readText(thing, DCTERMS.title) ?? { en: "a deck" },
        );
        builder.removeAll(DCTERMS.description);
        for (const [language, text] of Object.entries(description)) {
          builder.addStringWithLocale(DCTERMS.description, text, language);
        }
        return builder.build();
      }
      const title = getStringNoLocale(thing, DCTERMS.title) ?? "a deck";
      return builder.setStringNoLocale(DCTERMS.description, defaultDeckDescription(title)).build();
    }
    case "direct-deck":
      // Format 2 said the direction as a string; format 3 as a concept.
      return repair.version < 3
        ? builder.setStringNoLocale(SM.direction, "front-to-back").build()
        : builder.removeAll(SM.direction).setIri(SM.studyDirection, SM.frontToBack).build();
    case "drop-snapshot": {
      // An FSRS-6 state's own snapshot, else an SM-2 state's.
      const snapshot = getUrlAll(thing, SM.scheduler).includes(SM.fsrs6) ? FSRS_SNAPSHOT : SNAPSHOT;
      return snapshot.reduce((b, predicate) => b.removeAll(predicate), builder).build();
    }
    case "recompute-due": {
      const last = readDatetime(thing, SM.lastReviewedAt);
      const interval = getInteger(thing, SM.intervalDays);
      if (last === null || interval === null) return thing;
      const due = new Date(last.getTime() + interval * 86_400_000);
      // A due day past the years a study day holds leaves the due as it is.
      const day = Number.isNaN(due.getTime()) ? "" : due.toISOString().slice(0, 10);
      return isStudyDay(day) ? builder.setStringNoLocale(SM.due, day).build() : thing;
    }
    case "drop-unreadable-date":
      // Only the dates the app reads as none: a readable value of the same field stays.
      // Each field's in one pass, however many there are.
      return (repair.predicates ?? [])
        .reduce(
          (b, predicate) =>
            b.removeLiteralAll(predicate, XSD_DATETIME, unreadableDatetimes(thing, predicate)),
          builder,
        )
        .build();
    case "name-agent": {
      const url = repair.subjectUrl;
      const name = url.includes("#") ? url.slice(url.indexOf("#") + 1) : url;
      return builder.setStringNoLocale(FOAF_NAME, name).build();
    }
  }
}
