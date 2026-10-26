// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildThing,
  type Changes,
  changesOf,
  createSolidDataset,
  createThing,
  type Dataset,
  datasetFromQuads,
  getThing,
  removeThing,
  setThing,
  toRdfJsDataset,
  withQuads,
} from "./client/rdf";
import { datasetFrom } from "./testing/datasets";
import type { Quad, Term } from "@rdfjs/types";
import { appendAllToDocument, patchBody, saveDataset } from "./datasets";

vi.mock("./client/rdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client/rdf")>();
  return { ...actual, changesOf: vi.fn(actual.changesOf) };
});

const DOC = "https://pod.example/doc.ttl";
const NS = "https://example.com/ns#";

const XSD_DECIMAL = "http://www.w3.org/2001/XMLSchema#decimal";

const named = (value: string) => ({ termType: "NamedNode", value }) as Term;
const blank = { termType: "BlankNode", value: "b0" } as Term;
const triple = (subject: Term, predicate: string, object: Term) =>
  ({
    subject,
    predicate: named(predicate),
    object,
    graph: { termType: "DefaultGraph", value: "" },
  }) as Quad;

/**
 * DOC read holding `before`, each of its subjects then set to what
 * `after` says of it, or removed where that says nothing: the changes
 * delete the triples `after` lacks and add those `before` lacks.
 */
function edit(before: Quad[], after: Quad[]): Dataset {
  let dataset = withQuads(datasetFrom(DOC), before);
  const next = datasetFromQuads(after);
  const ids = new Set(
    [...before, ...after].map(({ subject }) =>
      subject.termType === "BlankNode" ? `_:${subject.value}` : subject.value,
    ),
  );
  for (const id of ids) {
    const subject = getThing(next, id);
    dataset = subject === null ? removeThing(dataset, id) : setThing(dataset, subject);
  }
  return dataset;
}

/**
 * Changes as the RDF module may report them, of a triple with a blank
 * node, which no edit through its operations records as one.
 */
const withBlankNode = (changes: Changes) => vi.mocked(changesOf).mockReturnValue(changes);

afterEach(() => {
  vi.mocked(changesOf).mockReset();
});

describe("patchBody", () => {
  it("writes each change as one N-Triples line, closed by a space and a dot, deletions first", () => {
    const read = setThing(
      datasetFrom(DOC),
      buildThing(createThing({ url: `${DOC}#it` }))
        .addInteger(`${NS}n`, 1)
        .build(),
    );
    const edited = setThing(
      withQuads(read, toRdfJsDataset(read)),
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
    const of = (predicate: string, value: string) =>
      triple(named(`${DOC}#it`), `${NS}${predicate}`, decimal(value));
    const edited = edit([of("d", "1.0"), of("f", "2.50"), of("g", "2.6")], [of("e", "3.0")]);
    const line = (predicate: string, value: string) =>
      `<${DOC}#it> <${NS}${predicate}> "${value}"^^<${XSD_DECIMAL}> .`;
    const insert = `INSERT DATA {\n${line("e", "3.0")}\n};\n`;
    expect(patchBody(edited)).toBe(
      `DELETE DATA {\n${line("d", "1.0")}\n${line("f", "2.50")}\n${line("g", "2.6")}\n};\n${insert}`,
    );
    expect(patchBody(edited, true)).toBe(
      `DELETE DATA {\n${line("d", "1")}\n${line("f", "2.5")}\n${line("g", "2.6")}\n};\n${insert}`,
    );
  });

  it("names a subject without a URL yet by its fragment in the document", () => {
    const local = createThing({ name: "new" });
    const added = setThing(createSolidDataset(), buildThing(local).addUrl(`${NS}p`, local).build());
    expect(patchBody(added)).toBe(`INSERT DATA {\n<#new> <${NS}p> <#new> .\n};\n`);
  });

  it("leaves the body to the Solid client library for a blank node, or a dataset without changes recorded", () => {
    expect(patchBody(createSolidDataset())).toBeNull();
    withBlankNode({ additions: [triple(named(`${DOC}#a`), `${NS}p`, blank)], deletions: [] });
    expect(patchBody(createSolidDataset())).toBeNull();
    withBlankNode({ additions: [], deletions: [triple(blank, `${NS}p`, named(`${DOC}#a`))] });
    expect(patchBody(createSolidDataset())).toBeNull();
  });

  it("is sent in place of the Solid client library's, which is sent when ours cannot name a change", async () => {
    const sent: string[] = [];
    const pod = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(String(init?.body));
      return new Response("", { status: 205 });
    }) as typeof globalThis.fetch;
    const edited = setThing(
      datasetFrom(DOC),
      buildThing(createThing({ url: `${DOC}#it` }))
        .addInteger(`${NS}n`, 2)
        .build(),
    );
    await saveDataset(DOC, edited, pod);
    expect(sent[0]).toBe(
      `INSERT DATA {\n<${DOC}#it> <${NS}n> "2"^^<http://www.w3.org/2001/XMLSchema#integer> .\n};\n`,
    );
    withBlankNode({ additions: [triple(named(`${DOC}#a`), `${NS}p`, blank)], deletions: [] });
    await saveDataset(DOC, edited, pod);
    // The library's own body, which starts with a space where ours starts with the statement.
    expect(sent[1]).toMatch(/^ INSERT DATA \{/);
  });

  describe("refused for a triple it cannot find to delete (409)", () => {
    const decimalEdit = (value: string) =>
      edit(
        [
          triple(named(`${DOC}#it`), `${NS}d`, {
            termType: "Literal",
            value,
            language: "",
            datatype: named(XSD_DECIMAL),
          } as Term),
        ],
        [],
      );
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
      withBlankNode({ additions: [], deletions: [triple(blank, `${NS}d`, named(`${DOC}#a`))] });
      const unnamed = pod(409, 200);
      await expect(saveDataset(DOC, decimalEdit("1.0"), unnamed.fetch)).rejects.toThrow();
      expect(unnamed.sent).toHaveLength(1);
    });

    it("fails when the second is refused too: the triple is gone", async () => {
      const { sent, fetch } = pod(409, 409);
      await expect(saveDataset(DOC, decimalEdit("1.0"), fetch)).rejects.toThrow();
      expect(sent).toHaveLength(2);
    });
  });
});

describe("a write of a term Turtle cannot write as it is (GHSA-x937-hx25-qfp4)", () => {
  const INJECTED = `https://img.example/a.png#p> . <${DOC}> <http://purl.org/dc/terms/isPartOf> <https://attacker.example/o`;
  const injected = triple(named(`${DOC}#card`), `${NS}frontImage`, named(INJECTED));
  const clean = triple(named(`${DOC}#card`), `${NS}front`, named(`${DOC}#x`));
  const unsent = () => {
    const sent: string[] = [];
    const fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(String(init?.body));
      return new Response("", { status: 205 });
    }) as typeof globalThis.fetch;
    return { sent, fetch };
  };

  it("is refused, nothing sent, as a new document", async () => {
    const { sent, fetch } = unsent();
    await expect(saveDataset(DOC, datasetFromQuads([injected]), fetch)).rejects.toMatchObject({
      code: "unwritableTerm",
    });
    expect(sent).toEqual([]);
  });

  it("is refused, nothing sent, as an edit's addition or deletion", async () => {
    const added = unsent();
    await expect(
      saveDataset(DOC, edit([clean], [clean, injected]), added.fetch),
    ).rejects.toMatchObject({
      code: "unwritableTerm",
    });
    const deleted = unsent();
    withBlankNode({
      additions: [],
      deletions: [
        triple({ termType: "BlankNode", value: "b x> . <y" } as Term, `${NS}p`, named(`${DOC}#a`)),
      ],
    });
    await expect(saveDataset(DOC, edit([clean], []), deleted.fetch)).rejects.toMatchObject({
      code: "unwritableTerm",
    });
    expect([...added.sent, ...deleted.sent]).toEqual([]);
  });

  it("is refused, nothing sent, where an edit is written as the whole document", async () => {
    const { sent, fetch } = unsent();
    const other = triple(named(`${DOC}#other`), `${NS}p`, named(`${DOC}#y`));
    await expect(
      saveDataset(DOC, edit([injected, clean], [injected]), fetch, { whole: true }),
    ).rejects.toMatchObject({ code: "unwritableTerm" });
    expect(sent).toEqual([]);
    // An edit that writes only its changes leaves the rest as the pod holds it.
    await saveDataset(DOC, edit([injected, clean], [injected, clean, other]), fetch);
    expect(sent).toHaveLength(1);
  });

  it("is refused, nothing sent, as an addition without a read", async () => {
    const { sent, fetch } = unsent();
    const thing = getThing(datasetFromQuads([injected]), `${DOC}#card`)!;
    await expect(appendAllToDocument(DOC, [thing], fetch)).rejects.toMatchObject({
      code: "unwritableTerm",
    });
    expect(sent).toEqual([]);
  });
});
