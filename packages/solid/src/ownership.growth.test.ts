// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Which subjects of a catalog another app wrote (foreignSubjects) is
 * told in time that grows with the catalog, not its square: many decks
 * naming as their creator one node of many classes, which is never
 * written beside them, so it is judged once and not again for every
 * deck (GHSA-p75p-ghrq-r3cm). Eight times as many decks and classes
 * must take less than four times as long as an eighth of them done
 * eight times over (testing.md); reading the catalog is not timed.
 */
import { expect, it } from "vitest";
import { growth } from "@solid-memo/domain/testing/growth";
import type { Dataset } from "@solid-memo/solid-client/rdf";
import { foreignSubjects } from "./ownership";
import { datasetOfTurtle } from "./testing/datasets";

const CATALOG = "https://other.example/solid-memo/main/catalog.ttl";

/**
 * A catalog of `count` decks, each naming `<#x>` as its creator, and
 * `<#x>` of `count` classes, none of them foaf:Agent.
 */
function catalog(count: number): string {
  const lines = [
    "@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .",
    "@prefix dcterms: <http://purl.org/dc/terms/> .",
    "<#catalog> a <http://www.w3.org/ns/dcat#Catalog> .",
    `<#x> a ${Array.from({ length: count }, (_, i) => `<https://other.example/T${i}>`).join(", ")} .`,
  ];
  for (let i = 0; i < count; i++) lines.push(`<#d${i}> a sm:Deck ; dcterms:creator <#x> .`);
  return lines.join("\n");
}

it("tells another app's subjects of a catalog whose decks all name one node of many classes in time that grows with them, not their square", async () => {
  const datasets = new Map<number, Dataset>();
  for (const count of [2_000, 16_000])
    datasets.set(count, await datasetOfTurtle(CATALOG, catalog(count)));
  expect(foreignSubjects(datasets.get(2_000)!)).toEqual(new Set([`${CATALOG}#x`]));
  const ratio = growth((count) => () => foreignSubjects(datasets.get(count)!), 2_000, 8, 4);
  expect(ratio).toBeLessThan(4);
}, 120_000);
