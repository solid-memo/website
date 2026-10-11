// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  buildThing,
  createSolidDataset,
  createThing,
  mockSolidDatasetFrom,
  setThing,
} from "@inrupt/solid-client";
import type { Quad, Term } from "@rdfjs/types";
import { patchBody, saveDataset } from "./datasets";

const DOC = "https://pod.example/doc.ttl";
const NS = "https://example.com/ns#";

const named = (value: string) => ({ termType: "NamedNode", value }) as Term;
const changes = (additions: Partial<Quad>[], deletions: Partial<Quad>[] = []) =>
  ({
    ...createSolidDataset(),
    internal_changeLog: { additions, deletions },
  }) as unknown as Parameters<typeof patchBody>[0];

describe("patchBody", () => {
  it("writes each change as one N-Triples line, closed by a space and a dot, deletions first", () => {
    const read = setThing(
      mockSolidDatasetFrom(DOC),
      buildThing(createThing({ url: `${DOC}#it` }))
        .addInteger(`${NS}n`, 1)
        .build(),
    );
    const edited = setThing(
      { ...read, internal_changeLog: { additions: [], deletions: [] } },
      buildThing(createThing({ url: `${DOC}#it` }))
        .addInteger(`${NS}n`, 2)
        .addUrl(`${NS}see`, "https://example.com/x")
        .addStringNoLocale(`${NS}s`, 'say "hi"\\\nthere\r')
        .addStringWithLocale(`${NS}t`, "hej", "sv")
        .build(),
    );
    expect(patchBody(edited)).toBe(
      [
        "DELETE DATA {",
        `<${DOC}#it> <${NS}n> "1"^^<http://www.w3.org/2001/XMLSchema#integer> .`,
        "};",
        "INSERT DATA {",
        `<${DOC}#it> <${NS}n> "2"^^<http://www.w3.org/2001/XMLSchema#integer> .`,
        `<${DOC}#it> <${NS}see> <https://example.com/x> .`,
        `<${DOC}#it> <${NS}s> "say \\"hi\\"\\\\\\nthere\\r" .`,
        `<${DOC}#it> <${NS}t> "hej"@sv .`,
        "};",
        "",
      ].join("\n"),
    );
  });

  it("names a Thing without a URL yet by its fragment in the document", () => {
    const local = {
      termType: "NamedNode",
      value: "https://inrupt.com/.well-known/sdk-local-node/new",
    } as Term;
    expect(
      patchBody(changes([{ subject: local, predicate: named(`${NS}p`), object: local } as Quad])),
    ).toBe(`INSERT DATA {\n<#new> <${NS}p> <#new> .\n};\n`);
  });

  it("leaves the body to @inrupt/solid-client for a blank node, or a dataset without changes recorded", () => {
    const blank = { termType: "BlankNode", value: "b0" } as Term;
    expect(
      patchBody(
        changes([
          { subject: named(`${DOC}#a`), predicate: named(`${NS}p`), object: blank } as Quad,
        ]),
      ),
    ).toBeNull();
    expect(
      patchBody(
        changes(
          [],
          [{ subject: blank, predicate: named(`${NS}p`), object: named(`${DOC}#a`) } as Quad],
        ),
      ),
    ).toBeNull();
    expect(patchBody(createSolidDataset())).toBeNull();
  });

  it("is sent in place of @inrupt/solid-client's, which is sent when ours cannot name a change", async () => {
    const sent: string[] = [];
    const pod = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(String(init?.body));
      return new Response("", { status: 205 });
    }) as typeof globalThis.fetch;
    const edited = setThing(
      mockSolidDatasetFrom(DOC),
      buildThing(createThing({ url: `${DOC}#it` }))
        .addInteger(`${NS}n`, 2)
        .build(),
    );
    await saveDataset(DOC, edited, pod);
    expect(sent[0]).toBe(
      `INSERT DATA {\n<${DOC}#it> <${NS}n> "2"^^<http://www.w3.org/2001/XMLSchema#integer> .\n};\n`,
    );
    const blank = { termType: "BlankNode", value: "b0", equals: () => false } as unknown as Term;
    const withBlank = {
      ...mockSolidDatasetFrom(DOC),
      internal_changeLog: {
        additions: [
          {
            subject: named(`${DOC}#a`),
            predicate: named(`${NS}p`),
            object: blank,
            graph: { termType: "DefaultGraph", value: "" },
          },
        ],
        deletions: [],
      },
    } as unknown as Parameters<typeof saveDataset>[1];
    await saveDataset(DOC, withBlank, pod);
    // @inrupt/solid-client's own body, which starts with a space where ours starts with the statement.
    expect(sent[1]).toMatch(/^ INSERT DATA \{/);
  });
});
