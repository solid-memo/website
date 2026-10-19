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

const XSD_DECIMAL = "http://www.w3.org/2001/XMLSchema#decimal";

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

  it("spells a deleted decimal as its number when asked, every addition as it is", () => {
    const decimal = (value: string) =>
      ({ termType: "Literal", value, language: "", datatype: named(XSD_DECIMAL) }) as Term;
    const triple = (predicate: string, value: string) =>
      ({
        subject: named(`${DOC}#it`),
        predicate: named(`${NS}${predicate}`),
        object: decimal(value),
      }) as Quad;
    const edit = changes(
      [triple("e", "3.0")],
      [triple("d", "1.0"), triple("f", "2.50"), triple("g", "2.6")],
    );
    const line = (predicate: string, value: string) =>
      `<${DOC}#it> <${NS}${predicate}> "${value}"^^<${XSD_DECIMAL}> .`;
    const insert = `INSERT DATA {\n${line("e", "3.0")}\n};\n`;
    expect(patchBody(edit)).toBe(
      `DELETE DATA {\n${line("d", "1.0")}\n${line("f", "2.50")}\n${line("g", "2.6")}\n};\n${insert}`,
    );
    expect(patchBody(edit, true)).toBe(
      `DELETE DATA {\n${line("d", "1")}\n${line("f", "2.5")}\n${line("g", "2.6")}\n};\n${insert}`,
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

  describe("refused for a triple it cannot find to delete (409)", () => {
    const decimalEdit = (value: string) =>
      ({
        ...mockSolidDatasetFrom(DOC),
        internal_changeLog: {
          additions: [],
          deletions: [
            {
              subject: named(`${DOC}#it`),
              predicate: named(`${NS}d`),
              object: { termType: "Literal", value, language: "", datatype: named(XSD_DECIMAL) },
              graph: { termType: "DefaultGraph", value: "" },
            },
          ],
        },
      }) as unknown as Parameters<typeof saveDataset>[1];
    /** A pod that answers each PATCH in turn, recording its body. */
    const pod = (...statuses: number[]) => {
      const sent: string[] = [];
      const fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        sent.push(String(init?.body));
        return new Response("", { status: statuses[sent.length - 1] });
      }) as typeof globalThis.fetch;
      return { sent, fetch };
    };

    it("is sent once more with its decimals spelled as numbers, as node-solid-server reads them", async () => {
      const { sent, fetch } = pod(409, 200);
      await saveDataset(DOC, decimalEdit("1.0"), fetch);
      expect(sent).toEqual([
        `DELETE DATA {\n<${DOC}#it> <${NS}d> "1.0"^^<${XSD_DECIMAL}> .\n};\n`,
        `DELETE DATA {\n<${DOC}#it> <${NS}d> "1"^^<${XSD_DECIMAL}> .\n};\n`,
      ]);
    });

    it("fails as refused when that spelling is the one sent, or when ours cannot name a change", async () => {
      const once = pod(409, 200);
      await expect(saveDataset(DOC, decimalEdit("2.6"), once.fetch)).rejects.toThrow();
      expect(once.sent).toHaveLength(1);
      const blank = { termType: "BlankNode", value: "b0", equals: () => false } as unknown as Term;
      const withBlank = {
        ...mockSolidDatasetFrom(DOC),
        internal_changeLog: {
          additions: [],
          deletions: [
            {
              subject: blank,
              predicate: named(`${NS}d`),
              object: named(`${DOC}#a`),
              graph: { termType: "DefaultGraph", value: "" },
            },
          ],
        },
      } as unknown as Parameters<typeof saveDataset>[1];
      const unnamed = pod(409, 200);
      await expect(saveDataset(DOC, withBlank, unnamed.fetch)).rejects.toThrow();
      expect(unnamed.sent).toHaveLength(1);
    });

    it("fails when the second is refused too: the triple is gone", async () => {
      const { sent, fetch } = pod(409, 409);
      await expect(saveDataset(DOC, decimalEdit("1.0"), fetch)).rejects.toThrow();
      expect(sent).toHaveLength(2);
    });
  });
});
