// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A document's repairs are applied in time that grows with them, not
 * their square, against a pod in memory: many review states' snapshots
 * dropped, many decks removed from the catalog and a deck group that
 * list them all, and many unreadable dates dropped from one deck. Eight times as many must take less than four
 * times as long as an eighth of them done eight times over (testing.md);
 * what puts the document in place is not timed (growthAfterSetup).
 */
import { expect, it } from "vitest";
import type { Repair } from "@solid-memo/domain/repair";
import { growthAfterSetup } from "@solid-memo/domain/testing/growth";
import { createSolidRepairRepository } from "./solidRepairRepository";
import { fakePod } from "./testing/fakePod";

const INSTANCE = "https://pod.example/solid-memo/main/";
const REVIEWS = `${INSTANCE}reviews/deck-1.ttl`;
const CATALOG = `${INSTANCE}catalog.ttl`;
const PREFIXES = `@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
`;

/** Review states, each with half an undo snapshot. */
function reviewStates(count: number): string {
  let ttl = PREFIXES;
  for (let i = 0; i < count; i++)
    ttl += `<#r${i}> a sm:ReviewState ; sm:formatVersion 2 ; sm:due "2026-09-27" ;
  sm:intervalDays 6 ; sm:previousDue "2026-09-20" .\n`;
  return ttl;
}

/** A catalog and a deck group that list every one of the decks. */
function catalog(count: number): string {
  const decks = Array.from({ length: count }, (_, i) => `<#deck-${i}>`).join(", ");
  let ttl = `${PREFIXES}<#catalog> a dcat:Catalog ; dcat:dataset ${decks} ; dcat:catalog <#group> .
<#group> a sm:DeckGroup, dcat:Catalog ; dcat:dataset ${decks} .\n`;
  for (let i = 0; i < count; i++)
    ttl += `<#deck-${i}> a sm:Deck, dcat:Dataset ; sm:formatVersion 6 .\n`;
  return ttl;
}

/** Times the repairs of a document of `count` subjects, written by `document`, made by `repairOf`. */
function repairsOf(
  url: string,
  document: (count: number) => string,
  repairOf: (subjectUrl: string) => Repair,
  name: (i: number) => string,
) {
  return (count: number) => async () => {
    const pod = fakePod();
    await pod.put(url, document(count));
    const repairs = createSolidRepairRepository({ fetch: pod.fetch });
    const all = Array.from({ length: count }, (_, i) => repairOf(`${url}#${name(i)}`));
    return () => repairs.applyRepairs(all);
  };
}

it("drops many review states' snapshots in time that grows with them, not their square", async () => {
  const ratio = await growthAfterSetup(
    repairsOf(
      REVIEWS,
      reviewStates,
      (subjectUrl) => ({ kind: "drop-snapshot", documentUrl: REVIEWS, subjectUrl, version: 2 }),
      (i) => `r${i}`,
    ),
    300,
    8,
  );
  expect(ratio).toBeLessThan(4);
}, 120_000);

it("removes many decks and their memberships in time that grows with them, not their square", async () => {
  const ratio = await growthAfterSetup(
    repairsOf(
      CATALOG,
      catalog,
      (subjectUrl) => ({ kind: "remove-subject", documentUrl: CATALOG, subjectUrl, version: 1 }),
      (i) => `deck-${i}`,
    ),
    300,
    8,
  );
  expect(ratio).toBeLessThan(4);
}, 120_000);

it("drops many unreadable dates of one deck in time that grows with them, not their square", async () => {
  const ratio = await growthAfterSetup(
    (count) => async () => {
      const pod = fakePod();
      // Years past what a JavaScript date holds, each its own value.
      const dates = Array.from(
        { length: count },
        (_, i) => `"${300_000 + i}-01-01T00:00:00Z"^^xsd:dateTime`,
      ).join(", ");
      await pod.put(
        CATALOG,
        `${PREFIXES}<#deck-1> a sm:Deck, dcat:Dataset ; sm:formatVersion 6 ; dcterms:created ${dates} .\n`,
      );
      const repairs = createSolidRepairRepository({ fetch: pod.fetch });
      const repair: Repair = {
        kind: "drop-unreadable-date",
        documentUrl: CATALOG,
        subjectUrl: `${CATALOG}#deck-1`,
        version: 6,
        predicates: ["http://purl.org/dc/terms/created"],
      };
      return () => repairs.applyRepairs([repair]);
    },
    2000,
    8,
  );
  expect(ratio).toBeLessThan(4);
}, 120_000);
