import { describe, expect, it } from "vitest";
import { buildThing, createThing, mockSolidDatasetFrom, setThing, type SolidDataset, type ThingPersisted } from "@inrupt/solid-client";
import { foreignSubjects } from "./ownership";
import { DCAT, DCTERMS, RDF, SM } from "./vocab";

const DOC = "https://pod.example/solid-memo/a/catalog.ttl";
const DCAT_DISTRIBUTION = "http://www.w3.org/ns/dcat#distribution";
const FOAF_AGENT = "http://xmlns.com/foaf/0.1/Agent";

function documentOf(...things: ThingPersisted[]): SolidDataset {
  return things.reduce<SolidDataset>((dataset, thing) => setThing(dataset, thing), mockSolidDatasetFrom(DOC));
}

const subject = (id: string) => buildThing(createThing({ url: id.startsWith("https:") ? id : `${DOC}#${id}` }));

describe("foreignSubjects", () => {
  it("leaves out what Solid Memo wrote, stamped or not, and what it names as creator, publisher or distribution", () => {
    const alice = "https://alice.example/profile/card#me";
    const dataset = documentOf(
      // The catalogue, its stamp dropped by another app's rewrite, and its publisher.
      subject("catalog").addIri(RDF.type, DCAT.Catalog).addUrl(DCTERMS.publisher, alice).addUrl(DCAT.dataset, `${DOC}#recipes`).build(),
      subject(alice).addIri(RDF.type, FOAF_AGENT).build(),
      // Two decks naming the same unstamped agent; one deck's distribution is unstamped too.
      subject("deck-1").addIri(RDF.type, SM.Deck).addUrl(DCTERMS.creator, `${DOC}#agent-1`).addUrl(DCAT_DISTRIBUTION, `${DOC}#deck-1-dist`).build(),
      subject("deck-2").addIri(RDF.type, SM.Deck).addUrl(DCTERMS.creator, `${DOC}#agent-1`).addUrl(DCTERMS.creator, "https://elsewhere.example/#bob").build(),
      subject("agent-1").addIri(RDF.type, FOAF_AGENT).build(),
      subject("deck-1-dist").addIri(RDF.type, "http://www.w3.org/ns/dcat#Distribution").build(),
      // A stamped subject with no Solid Memo class is Solid Memo's.
      subject("agent-2").addIri(RDF.type, FOAF_AGENT).addInteger(SM.formatVersion, 1).build(),
      // Another app's dataset, and its publisher: neither is Solid Memo's.
      subject("recipes").addIri(RDF.type, DCAT.Dataset).addUrl(DCTERMS.publisher, `${DOC}#chef`).build(),
      subject("chef").addIri(RDF.type, FOAF_AGENT).build(),
    );
    expect(foreignSubjects(dataset)).toEqual(new Set([`${DOC}#recipes`, `${DOC}#chef`]));
  });

  it("finds nothing foreign in an empty document", () => {
    expect(foreignSubjects(documentOf())).toEqual(new Set());
  });

  it("counts a review state of another scheduler as another app's, stamped or not", () => {
    const fsrs = "https://fsrs.example/ns#fsrs";
    const dataset = documentOf(
      subject("card-1").addIri(RDF.type, SM.ReviewState).addInteger(SM.formatVersion, 2).addIri(SM.scheduler, SM.sm2).build(),
      subject("card-2").addIri(RDF.type, SM.ReviewState).build(),
      subject("rs-1").addIri(RDF.type, SM.ReviewState).addIri(SM.scheduler, fsrs).build(),
      subject("rs-2").addIri(RDF.type, SM.ReviewState).addInteger(SM.formatVersion, 2).addIri(SM.scheduler, fsrs).build(),
      // A scheduler named by a literal, even one spelling SM-2's IRI, is not SM-2.
      subject("rs-3").addIri(RDF.type, SM.ReviewState).addStringNoLocale(SM.scheduler, "fsrs").build(),
      subject("rs-4").addIri(RDF.type, SM.ReviewState).addIri(SM.scheduler, SM.sm2).addStringNoLocale(SM.scheduler, SM.sm2).build(),
    );
    expect(foreignSubjects(dataset)).toEqual(new Set([`${DOC}#rs-1`, `${DOC}#rs-2`, `${DOC}#rs-3`, `${DOC}#rs-4`]));
  });
});
