// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The guest's pod on this device stores and changes a document of many
 * N-Triples lines past the bound on a term (MAX_TERM_CHARACTERS) in time
 * that grows with them, not their square: many keywords of one deck, of
 * one length, alike but for their end. Eight times as many must take
 * less than four times as long as an eighth of them done eight times
 * over (testing.md); what puts the document in place is not timed
 * (growthAfterSetup).
 */
import { expect, it } from "vitest";
import { growthAfterSetup } from "@solid-memo/domain/testing/growth";
import { MAX_TERM_CHARACTERS } from "./client/readLimits";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";

const ROOT = "https://guest.example/";
const DOC = `${ROOT}memo/library.ttl`;
const SUBJECT = `<${DOC}#deck-1>`;
const KEYWORD = "<http://www.w3.org/ns/dcat#keyword>";
const PREFIX = "k".repeat(MAX_TERM_CHARACTERS - 83);

/** The `i`th keyword line, past the bound on a term, alike to the others but for its end. */
const line = (i: number) => `${SUBJECT} ${KEYWORD} "${PREFIX}${String(i).padStart(6, "0")}"@en .`;

const lines = (count: number) => Array.from({ length: count }, (_, i) => line(i));

/** A pod holding nothing, or the document of `count` keyword lines, and its fetch. */
async function pod(count?: number) {
  const store = createMemoryResourceStore();
  if (count !== undefined)
    await store.set(DOC, { kind: "rdf", etag: '"e0"', triples: lines(count) });
  let etags = 0;
  return createLocalPod({ root: ROOT, store, newEtag: () => `"e${++etags}"` });
}

it("times lines past the bound on a term", () => {
  expect(line(0).length).toBeGreaterThan(MAX_TERM_CHARACTERS);
});

it("stores a document of many long lines in time that grows with them, not their square", async () => {
  const ratio = await growthAfterSetup(
    (count) => async () => {
      const fetch = await pod();
      const body = lines(count).join("\n");
      return async () => {
        const response = await fetch(DOC, {
          method: "PUT",
          headers: { "Content-Type": "text/turtle" },
          body,
        });
        expect(response.status).toBe(201);
      };
    },
    250,
    8,
  );
  expect(ratio).toBeLessThan(4);
}, 180_000);

it("changes a document of many long lines in time that grows with them, not their square", async () => {
  const ratio = await growthAfterSetup(
    (count) => async () => {
      const fetch = await pod(count);
      const body = `DELETE DATA {\n${line(0)}\n};\nINSERT DATA {\n${line(count)}\n};\n`;
      return async () => {
        const response = await fetch(DOC, {
          method: "PATCH",
          headers: { "Content-Type": "application/sparql-update" },
          body,
        });
        expect(response.status).toBe(205);
      };
    },
    250,
    8,
  );
  expect(ratio).toBeLessThan(4);
}, 180_000);
