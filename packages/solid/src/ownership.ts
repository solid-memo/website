import { getInteger, getThing, getThingAll, getUrlAll, type SolidDataset } from "@inrupt/solid-client";
import { namesAnotherScheduler } from "./mappers/reviewStateMapper";
import { DCTERMS, RDF, SM, SM_NS } from "./vocab";

/**
 * The links from a subject of Solid Memo's to the subjects it writes
 * beside it: a deck's creators and distribution, a catalogue's or deck
 * group's publisher.
 */
const WRITTEN_BESIDE = [DCTERMS.creator, DCTERMS.publisher, "http://www.w3.org/ns/dcat#distribution"];

/**
 * The subjects of a document that Solid Memo wrote (see docs/validation.md
 * "Data another app wrote"): those with a Solid Memo class or its format
 * stamp, the catalogue at `#catalog`, and whatever these name as their
 * creator, publisher or distribution — a catalogue, an agent and a
 * distribution have no class of Solid Memo's own, and they stay Solid
 * Memo's when another app's rewrite has dropped their stamp. A subject
 * naming another scheduler (any sm:scheduler but the sm:sm2 IRI) is
 * never Solid Memo's. Every
 * other subject of the document is another app's.
 */
function solidMemoSubjects(dataset: SolidDataset): Set<string> {
  const pending = getThingAll(dataset)
    .filter(
      (thing) =>
        !namesAnotherScheduler(thing) &&
        (thing.url.endsWith("#catalog") ||
          getInteger(thing, SM.formatVersion) !== null ||
          getUrlAll(thing, RDF.type).some((type) => type.startsWith(SM_NS))),
    )
    .map((thing) => thing.url);
  const owned = new Set(pending);
  for (let url = pending.pop(); url !== undefined; url = pending.pop()) {
    const thing = getThing(dataset, url);
    if (thing === null) continue;
    for (const target of WRITTEN_BESIDE.flatMap((link) => getUrlAll(thing, link))) {
      if (owned.has(target)) continue;
      owned.add(target);
      pending.push(target);
    }
  }
  return owned;
}

/** The subjects of a document another app wrote: every one that is not Solid Memo's (solidMemoSubjects). */
export function foreignSubjects(dataset: SolidDataset): Set<string> {
  const owned = solidMemoSubjects(dataset);
  return new Set(getThingAll(dataset).map((thing) => thing.url).filter((url) => !owned.has(url)));
}
