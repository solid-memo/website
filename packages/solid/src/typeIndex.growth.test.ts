// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * An instance's registrations in a type index are renamed and removed
 * in time that grows with them, not their square, against a pod in
 * memory: many registrations of the instance, half of them naming
 * another app's folder besides. Eight times as many must take less than
 * four times as long as an eighth of them done eight times over
 * (testing.md); what puts the index in place is not timed
 * (growthAfterSetup).
 */
import { expect, it } from "vitest";
import { growthAfterSetup } from "@solid-memo/domain/testing/growth";
import { fakePod } from "./testing/fakePod";
import { removeInstanceRegistrations, renameInstanceRegistrations } from "./typeIndex";

const INDEX = "https://alice.example/settings/privateTypeIndex.ttl";
const INSTANCE = "https://alice.example/solid-memo/main/";
const OTHER = "https://alice.example/other-app/";

/** A type index of `count` registrations of the instance, every second one naming another folder too. */
function index(count: number): string {
  let ttl = `@prefix solid: <http://www.w3.org/ns/solid/terms#> .
@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
`;
  for (let i = 0; i < count; i++) {
    const also = i % 2 === 0 ? `, <${OTHER}${i}/>` : "";
    ttl += `<#r${i}> a solid:TypeRegistration ; solid:forClass sm:Instance ;
  solid:instanceContainer <${INSTANCE}>${also} ; dcterms:title "Main" .\n`;
  }
  return ttl;
}

/** Times `work` on a type index of `count` registrations of the instance. */
function onIndex(work: (fetch: typeof globalThis.fetch) => Promise<void>) {
  return (count: number) => async () => {
    const pod = fakePod();
    await pod.put(INDEX, index(count));
    return () => work(pod.fetch);
  };
}

it("renames many registrations of an instance in time that grows with them, not their square", async () => {
  const ratio = await growthAfterSetup(
    onIndex((fetch) =>
      renameInstanceRegistrations(INDEX, { containerUrl: INSTANCE, title: "Renamed" }, fetch),
    ),
    300,
    8,
  );
  expect(ratio).toBeLessThan(4);
}, 120_000);

it("removes many registrations of an instance in time that grows with them, not their square", async () => {
  const ratio = await growthAfterSetup(
    onIndex((fetch) => removeInstanceRegistrations(INDEX, INSTANCE, fetch)),
    300,
    8,
  );
  expect(ratio).toBeLessThan(4);
}, 120_000);
