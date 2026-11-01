// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The digest is written in time that grows with its subjects, not their
 * square, against a pod in memory: many month summaries dropped in one
 * write. Eight times as many must take less than four times as long as
 * an eighth of them done eight times over (testing.md); what puts the
 * digest in place is not timed (growthAfterSetup).
 */
import { expect, it } from "vitest";
import { withMonthSummaries } from "@solid-memo/domain/studyDigest";
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
      return () => digests.updateDigest(INSTANCE, (stored) => withMonthSummaries(stored!, {}));
    },
    300,
    8,
  );
  expect(ratio).toBeLessThan(4);
}, 120_000);
