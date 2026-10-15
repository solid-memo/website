// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { parseConceptSchemes } from "./concepts.ts";
import { NS_ROOT } from "./root.ts";
import { VOCAB_BASE } from "./sources.ts";
import { parseVocab, SM_NS } from "./vocab.ts";

const XSD = "http://www.w3.org/2001/XMLSchema#";
const SKOS = "http://www.w3.org/2004/02/skos/core#";
const TOPICS = `${VOCAB_BASE}topics.ttl`;

/** An IRI as the vocabulary's docs write it. */
function short(iri: string): string {
  return iri
    .replace(SM_NS, "sm:")
    .replace(XSD, "xsd:")
    .replace(SKOS, "skos:")
    .replace(`${TOPICS}#`, "topics:");
}

/**
 * The vocabulary's terms and topics, part of the public API
 * (docs/releasing.md#the-public-api): within v1 a term is only ever
 * added, and its kind, range and domain never change; a topic is never
 * taken back (docs/vocab.md#versioning-policy). So none of these lines
 * ever goes, whatever a commit says (`npm run check:breaking`). A term
 * that should no longer be written is deprecated, which keeps its line.
 */
it("keeps api/frozen/vocab.txt to the terms and topics", async () => {
  const vocab = parseVocab(await readFile(join(NS_ROOT, "vocab/v1.ttl"), "utf8"));
  const topics = parseConceptSchemes(
    await readFile(join(NS_ROOT, "vocab/topics.ttl"), "utf8"),
    TOPICS,
  );
  const lines = [
    ...vocab.terms.map((term) =>
      [
        `${short(term.iri)}: ${term.kind}`,
        ...(term.range === undefined ? [] : [`range ${short(term.range)}`]),
        ...(term.domain === undefined ? [] : [`domain ${short(term.domain)}`]),
      ].join(", "),
    ),
    ...topics.flatMap((scheme) => scheme.concepts.map((concept) => `${short(concept.iri)}: topic`)),
  ];
  await expect(`${lines.sort().join("\n")}\n`).toMatchFileSnapshot("../../../api/frozen/vocab.txt");
});
