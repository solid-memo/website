// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * What a visit learns is kept in the digest in time that grows with the
 * digest and the facts, not their product: as many receipts noted as
 * the digest already holds. Eight times as many must take less than
 * four times as long as an eighth of them done eight times over
 * (testing.md); what puts the digest in place is not timed
 * (growthAfterSetup).
 */
import { expect, it } from "vitest";
import { emptyDigest, type InstanceDigest } from "@solid-memo/domain/studyDigest";
import { growthAfterSetup } from "@solid-memo/domain/testing/growth";
import { createDigestStore, noting } from "./digestStore";
import { makeDeps } from "./testing/fakePorts";

const INSTANCE = "https://pod.example/solid-memo/main/";

/** A digest of `count` receipts. */
function receipts(count: number): InstanceDigest {
  const digest = emptyDigest();
  for (let i = 0; i < count; i++) {
    const document = `${INSTANCE}decks/d${i}.ttl`;
    digest.receipts[document] = { document, version: '"v1"' };
  }
  return digest;
}

it("notes many receipts in a digest of many in time that grows with them, not their product", async () => {
  const ratio = await growthAfterSetup(
    (count) => async () => {
      const stored = receipts(count);
      const store = createDigestStore({
        ...makeDeps(),
        digestRepository: { readDigest: async () => stored, updateDigest: async () => undefined },
        ruleset: "rules",
        preferenceStore: { get: async () => ({}) as never },
        answerStore: { flush: async () => undefined },
        now: () => new Date(),
      });
      await store.of(INSTANCE);
      return async () => {
        for (let i = 0; i < count; i++)
          store.remember(INSTANCE, noting(`${INSTANCE}decks/d${i}.ttl`, '"v2"', {}));
        const digest = await store.of(INSTANCE);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(digest.receipts[`${INSTANCE}decks/d0.ttl`]!.version).toBe('"v2"');
      };
    },
    300,
    8,
  );
  expect(ratio).toBeLessThan(4);
}, 120_000);
