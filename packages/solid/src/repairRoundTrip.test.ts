// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { planRepair, type RepairKind } from "@solid-memo/domain/repair";
import { arrangementSetAside, summarize } from "@solid-memo/domain/validation";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Dataset } from "./client/rdf";
import { writeDocument } from "./client/resources";
import { getSolidDatasetOrNull } from "./datasets";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import { createSolidRepairRepository } from "./solidRepairRepository";
import { datasetOfTurtle } from "./testing/datasets";

vi.mock("./client/resources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client/resources")>();
  return {
    ...actual, // A write the pod takes as given, with no version.
    writeDocument: vi.fn(async (_url: string, dataset: object) => ({ dataset, etag: undefined })),
  };
});
vi.mock("./datasets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./datasets")>()),
  getSolidDatasetOrNull: vi.fn(),
}));

/**
 * Each repair the check plans, applied to the pod, clears the result it
 * was planned for: the document checked again plans nothing, and an
 * arrangement a repair of the catalog's was for is no longer set aside.
 * The real shapes, check, plan and repairs, over a pod in memory.
 */

const INSTANCE = "https://pod.example/solid-memo/a/";
const CATALOG = `${INSTANCE}catalog.ttl`;
const REVIEWS = `${INSTANCE}reviews/deck-1.ttl`;
const ME = "https://alice.example/profile/card#me";
const AT = '"2026-11-01T00:00:00Z"^^xsd:dateTime';

const PREFIXES = `@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
`;

/** A deck's own description and direction. */
const DECK = 'dcterms:description "Capitals of the world."@en ; sm:studyDirection sm:frontToBack';

/** A catalog document with a deck and a deck group, with what each subject is given in place of its own. */
function catalogOf({
  catalog = "dcat:dataset <#deck-1> ; dcat:catalog <#group-1>",
  agent = 'foaf:name "Alice"',
  deck = DECK,
  group = "dcat:dataset <#deck-1>",
} = {}): string {
  return `${PREFIXES}
<#catalog> a dcat:Catalog ; dcterms:title "Main" ; dcterms:description "My decks." ;
  dcterms:publisher <${ME}> ; ${catalog} .
<${ME}> a foaf:Agent ; ${agent} .
<#deck-1> a sm:Deck, dcat:Dataset ; sm:formatVersion 6 ; dcterms:title "Capitals"@en ; ${deck} ;
  sm:cardsDocument <decks/deck-1.ttl> ; sm:reviewsDocument <reviews/deck-1.ttl> .
<#group-1> a sm:DeckGroup, dcat:Catalog ; sm:formatVersion 1 ; dcterms:title "Geography"@en ;
  dcterms:description "Deck group: Geography."@en ; dcterms:publisher <${ME}> ; ${group} .
`;
}

/** A reviews document with one SM-2 state, with what it is given beside its own. */
function reviewsOf({ due = "2026-11-02", extra = "" } = {}): string {
  return `${PREFIXES}
<> dcterms:isPartOf <../catalog.ttl#deck-1> .
<#c1> a sm:ReviewState ; sm:formatVersion 2 ; sm:reviewOf <../decks/deck-1.ttl#c1> ;
  sm:reviewDirection sm:frontToBack ; sm:scheduler sm:sm2 ; sm:easeFactor 2.5 ;
  sm:intervalDays 1 ; sm:repetitions 1 ; sm:due "${due}" ;
  sm:firstReviewedAt ${AT} ; sm:lastReviewedAt ${AT} ${extra}.
`;
}

const validator = createShaclShapeValidator({ fetch: vi.fn(), shapesFetch, ...SHAPE_SOURCES });

async function reportOn(url: string, dataset: Dataset) {
  return summarize(INSTANCE, [await validator.validateDataset(url, dataset, "pod")]);
}

beforeEach(() => {
  vi.mocked(getSolidDatasetOrNull).mockReset();
  vi.mocked(writeDocument).mockReset();
});

describe("a planned repair", () => {
  it("has nothing to repair in the documents as the app writes them", async () => {
    for (const [url, turtle] of [
      [CATALOG, catalogOf()],
      [REVIEWS, reviewsOf()],
    ]) {
      const report = await reportOn(url, await datasetOfTurtle(url, turtle));
      expect(planRepair(report)).toEqual({ repairs: [], unrepairable: [] });
    }
  }, 120_000);

  /** What a repair is planned for: a subject of a document, and whether it sets the arrangement aside. */
  interface Case {
    name: string;
    kind: RepairKind;
    url: string;
    subject: string;
    turtle: string;
    arrangement?: true;
  }
  const atCatalog = (name: string, kind: RepairKind, subject: string, turtle: string) => ({
    name,
    kind,
    url: CATALOG,
    subject: `${CATALOG}${subject}`,
    turtle,
  });
  const ofState = (name: string, kind: RepairKind, turtle: string) => ({
    name,
    kind,
    url: REVIEWS,
    subject: `${REVIEWS}#c1`,
    turtle,
  });
  const cases: Case[] = [
    atCatalog(
      "a deck without its description",
      "describe-deck",
      "#deck-1",
      catalogOf({ deck: "sm:studyDirection sm:frontToBack" }),
    ),
    atCatalog(
      "a deck without its direction",
      "direct-deck",
      "#deck-1",
      catalogOf({ deck: 'dcterms:description "Capitals of the world."@en' }),
    ),
    atCatalog(
      "a deck's optional date that cannot be read",
      "drop-unreadable-date",
      "#deck-1",
      catalogOf({ deck: `${DECK} ; dcterms:modified "300000-01-01T00:00:00Z"^^xsd:dateTime` }),
    ),
    {
      ...atCatalog(
        "an agent without a name",
        "name-agent",
        "",
        catalogOf({ agent: "a foaf:Agent" }),
      ),
      subject: ME,
    },
    {
      ...atCatalog(
        "a catalog's link to a subject of its document that it does not describe",
        "drop-dangling-members",
        "#catalog",
        catalogOf({ catalog: "dcat:dataset <#deck-1>, <#gone> ; dcat:catalog <#group-1>" }),
      ),
      arrangement: true,
    },
    {
      ...atCatalog(
        "a catalog's link to its own document",
        "drop-dangling-members",
        "#catalog",
        catalogOf({ catalog: "dcat:dataset <#deck-1>, <> ; dcat:catalog <#group-1>" }),
      ),
      arrangement: true,
    },
    {
      ...atCatalog(
        "a deck group's link to its own document",
        "drop-dangling-members",
        "#group-1",
        catalogOf({ group: "dcat:dataset <#deck-1> ; dcat:catalog <>" }),
      ),
      arrangement: true,
    },
    ofState(
      "a half-written undo snapshot",
      "drop-snapshot",
      reviewsOf({ extra: "; sm:previousEaseFactor 2.5 " }),
    ),
    ofState("a due day that is no day", "recompute-due", reviewsOf({ due: "soon" })),
  ];

  it.each(cases)(
    "clears what it was planned for: $name ($kind)",
    async ({ kind, url, subject, turtle, arrangement }: Case) => {
      const dataset = await datasetOfTurtle(url, turtle);
      const report = await reportOn(url, dataset);
      const plan = planRepair(report);
      expect(plan).toEqual({
        repairs: [expect.objectContaining({ kind, documentUrl: url, subjectUrl: subject })],
        unrepairable: [],
      });
      expect(arrangementSetAside(report)).toBe(arrangement === true);

      vi.mocked(getSolidDatasetOrNull).mockResolvedValue(dataset as never);
      await createSolidRepairRepository({ fetch: vi.fn() as never }).applyRepairs(
        plan.repairs,
        () => [],
      );
      const saved = vi.mocked(writeDocument).mock.calls[0][1] as Dataset;
      const again = await reportOn(url, saved);
      expect(planRepair(again)).toEqual({ repairs: [], unrepairable: [] });
      expect(arrangementSetAside(again)).toBe(false);
      // What was repaired can be written again.
      await expect(validator.checkSubjects(saved, [subject], "pod")).resolves.toBeUndefined();
    },
    120_000,
  );
});
