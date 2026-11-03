// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The digest is written in time that grows with its subjects, not their
 * square, against a pod in memory: many month summaries dropped in one
 * write, and as many receipts noted at once as the digest holds.
 * Eight times as many must take less than four times as long as an
 * eighth of them done eight times over (testing.md); what puts the
 * digest in place is not timed (growthAfterSetup).
 */
import { expect, it } from "vitest";
import { addReceipt, setMonthSummaries } from "@solid-memo/domain/studyDigest";
import { growthAfterSetup } from "@solid-memo/domain/testing/growth";
import { createSolidDigestRepository } from "./solidDigestRepository";
import { fakePod } from "./testing/fakePod";

const INSTANCE = "https://pod.example/solid-memo/main/";
const DIGEST = `${INSTANCE}digest.ttl`;
const PREFIXES = "@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .\n";

/** A digest of `count` month summaries, of documents elsewhere. */
function summaries(count: number): string {
  let ttl = PREFIXES;
  for (let i = 0; i < count; i++)
    ttl += `<#m${i}> a sm:MonthSummary ; sm:formatVersion 1 ;
  sm:summaryOf <https://elsewhere.example/x${i}/history/2026-01.ttl> ; sm:summarizedVersion "v" ;
  sm:youngReviewCount 0 ; sm:youngRecalledCount 0 ; sm:studyDayCounts "2026-01-01 1 0 0 0" .\n`;
  return ttl;
}

it("drops many month summaries in time that grows with them, not their square", async () => {
  const ratio = await growthAfterSetup(
    (count) => async () => {
      const pod = fakePod();
      await pod.put(DIGEST, summaries(count));
      const digests = createSolidDigestRepository({ fetch: pod.fetch });
      return () => digests.updateDigest(INSTANCE, (draft) => setMonthSummaries(draft, {}));
    },
    300,
    8,
  );
  expect(ratio).toBeLessThan(4);
}, 120_000);

/** A digest of `count` receipts, of the instance's documents. */
function receipts(count: number): string {
  let ttl = PREFIXES;
  for (let i = 0; i < count; i++)
    ttl += `<#r${i}> a sm:DocumentReceipt ; sm:formatVersion 1 ;
  sm:receiptOf <decks/d${i}.ttl> ; sm:documentVersion "v1" .\n`;
  return ttl;
}

it("notes many receipts at once in time that grows with them and the digest, not their product", async () => {
  const ratio = await growthAfterSetup(
    (count) => async () => {
      const pod = fakePod();
      await pod.put(DIGEST, receipts(count));
      const digests = createSolidDigestRepository({ fetch: pod.fetch });
      return () =>
        Promise.all(
          // Each receipt noted ten times over, so that copying the digest for each would show.
          Array.from({ length: 10 * count }, (_, i) =>
            digests.updateDigest(INSTANCE, (draft) =>
              addReceipt(draft, `${INSTANCE}decks/d${i % count}.ttl`, `v${i}`, {}),
            ),
          ),
        );
    },
    300,
    8,
  );
  expect(ratio).toBeLessThan(4);
}, 120_000);
