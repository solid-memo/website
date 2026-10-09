import {
  buildThing,
  getDatetime,
  getInteger,
  getStringNoLocale,
  getThing,
  getThingAll,
  getUrlAll,
  removeThing,
  setThing,
  type SolidDataset,
  type Thing,
} from "@inrupt/solid-client";
import type { RepairRepository } from "@solid-memo/application/ports";
import { defaultDeckDescription, defaultDeckDescriptionText } from "@solid-memo/domain/dcat";
import type { Repair, RepairKind } from "@solid-memo/domain/repair";
import { getSolidDatasetOrNull, saveDataset } from "./datasets";
import { foreignSubjects } from "./ownership";
import { readText, unlessNewer } from "./records";
import { DCAT, DCTERMS, RDF, SM } from "./vocab";

const FOAF_NAME = "http://xmlns.com/foaf/0.1/name";
const SNAPSHOT = [
  SM.previousEaseFactor,
  SM.previousIntervalDays,
  SM.previousRepetitions,
  SM.previousDue,
  SM.previousLastReviewedAt,
];

/**
 * Repairs written to the pod (see docs/validation.md): each document is
 * read once, every repair of its subjects applied, and written once. A
 * repair only fills in or removes what its problem is about, so what
 * else a subject says survives; a subject that is gone is skipped.
 */
export function createSolidRepairRepository({
  fetch,
}: {
  fetch: typeof globalThis.fetch;
}): RepairRepository {
  return {
    async applyRepairs(repairs) {
      for (const documentUrl of [...new Set(repairs.map((r) => r.documentUrl))]) {
        const dataset = await getSolidDatasetOrNull(documentUrl, fetch);
        if (dataset === null) continue;
        const repaired = repairs
          .filter((r) => r.documentUrl === documentUrl)
          .reduce<SolidDataset>((current, repair) => applyRepair(current, repair), dataset);
        await saveDataset(documentUrl, repaired, fetch);
      }
    },
  };
}

/**
 * The links that make a deck or deck group a member of a catalogue or
 * group, and the classes of what they link to: the DCAT class, or the
 * Solid Memo one alone (a deck that lost its DCAT class is still listed,
 * so the catalogue keeps listing every deck).
 */
const MEMBERSHIP = [
  { link: DCAT.dataset, types: [DCAT.Dataset, SM.Deck] },
  { link: DCAT.catalog, types: [DCAT.Catalog, SM.DeckGroup] },
];

function applyRepair(dataset: SolidDataset, repair: Repair): SolidDataset {
  const thing = getThing(dataset, repair.subjectUrl);
  if (thing === null) return dataset;
  // A repair is of what this version found: never of a subject a newer one has written since.
  unlessNewer(thing);
  if (repair.kind === "remove-subject") {
    return withoutMembershipsOf(removeThing(dataset, thing), repair.documentUrl, repair.subjectUrl);
  }
  if (repair.kind === "drop-dangling-members") {
    return setThing(dataset, withoutDanglingMembers(dataset, repair.documentUrl, thing));
  }
  return setThing(dataset, repairedThing(thing, { ...repair, kind: repair.kind }));
}

/**
 * A removed subject is no member of the catalogue (`#catalog`) or of a
 * deck group any more. Only those links go: who else names it — a deck
 * its creator, the catalogue its publisher — is left as it is.
 */
function withoutMembershipsOf(dataset: SolidDataset, documentUrl: string, url: string): SolidDataset {
  return getThingAll(dataset)
    .filter((thing) => thing.url === `${documentUrl}#catalog` || getUrlAll(thing, RDF.type).includes(SM.DeckGroup))
    .reduce(
      (current, parent) =>
        setThing(current, MEMBERSHIP.reduce((builder, { link }) => builder.removeUrl(link, url), buildThing(parent)).build()),
      dataset,
    );
}

/**
 * A catalogue or deck group without its links to subjects of its own
 * document that the document does not describe as decks or groups. A
 * member in another document (a dataset another app listed) is described
 * there, and its link stays, as does one another app described in this
 * document, whatever its class.
 */
function withoutDanglingMembers(dataset: SolidDataset, documentUrl: string, thing: Thing): Thing {
  const foreign = foreignSubjects(dataset);
  const describes = (url: string, types: string[]) => {
    const member = getThing(dataset, url);
    return member !== null && (foreign.has(url) || getUrlAll(member, RDF.type).some((type) => types.includes(type)));
  };
  return MEMBERSHIP.reduce(
    (builder, { link, types }) =>
      getUrlAll(thing, link)
        .filter((url) => url.startsWith(`${documentUrl}#`) && !describes(url, types))
        .reduce((b, url) => b.removeUrl(link, url), builder),
    buildThing(thing),
  ).build();
}

function repairedThing(
  thing: Thing,
  repair: Repair & { kind: Exclude<RepairKind, "remove-subject" | "drop-dangling-members"> },
): Thing {
  const builder = buildThing(thing);
  switch (repair.kind) {
    case "describe-deck": {
      // Format 4 states text language-tagged, the app's own in English and
      // Swedish; from format 5 the title may be in any language, so it is read in every one.
      if (repair.version >= 4) {
        const description = defaultDeckDescriptionText(readText(thing, DCTERMS.title) ?? { en: "a deck" });
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
    case "drop-snapshot":
      return SNAPSHOT.reduce((b, predicate) => b.removeAll(predicate), builder).build();
    case "recompute-due": {
      const last = getDatetime(thing, SM.lastReviewedAt);
      const interval = getInteger(thing, SM.intervalDays);
      if (last === null || interval === null) return thing;
      const due = new Date(last.getTime() + interval * 86_400_000).toISOString().slice(0, 10);
      return builder.setStringNoLocale(SM.due, due).build();
    }
    case "name-agent": {
      const url = repair.subjectUrl;
      const name = url.includes("#") ? url.slice(url.indexOf("#") + 1) : url;
      return builder.setStringNoLocale(FOAF_NAME, name).build();
    }
  }
}
