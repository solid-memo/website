// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { defaultIo, main, run } from "./checkProse.ts";

const INDEX = `@base <https://solid-memo.com/docs/> .

@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix schema:  <https://schema.org/> .

<>
    a schema:Collection ;
    dcterms:title "Docs"@en .

<#the-app>
    a schema:Collection ;
    dcterms:title "The app"@en ;
    schema:isPartOf <> ;
    schema:position 10 .

<guide.md>
    a schema:TechArticle ;
    schema:isPartOf <#the-app> ;
    schema:position 10 ;
    schema:learningResourceType "tutorial" ;
    dcterms:abstract "the guide."@en .

<srs.md>
    a schema:TechArticle ;
    schema:isPartOf <#the-app> ;
    schema:position 20 ;
    schema:learningResourceType "reference" ;
    dcterms:abstract "the scheduler."@en .
`;

const RULES = JSON.stringify({
  rules: [
    {
      check: "words",
      id: "neutral",
      message: "name who acts",
      terms: ["you"],
      kinds: ["reference"],
    },
  ],
});

function fakeIo(pages: Record<string, string>, index = INDEX) {
  const logs: string[] = [];
  return {
    logs,
    pages: () => Object.keys(pages),
    page: (name: string) => pages[name]!,
    index: () => index,
    rules: () => RULES,
    log: (message: string) => logs.push(message),
  };
}

describe("main", () => {
  it("checks each page by its kind, the README as a reference page, and returns 0", () => {
    const io = fakeIo({
      "srs.md": "# SRS\n\nA card comes back.\n",
      "guide.md": "# Guide\n\nThen you study.\n",
      "README.md": "# Docs\n\nOne page per part.\n",
    });
    expect(main(["node"], io)).toBe(0);
    expect(io.logs).toEqual(["3 pages follow the prose rules in prose.json."]);
  });

  it("logs each problem with its page and line, and returns 1", () => {
    const io = fakeIo({
      "srs.md": "# SRS\n\nA card comes back\nwhen you study.\n",
      "README.md": "# Docs\n\nIf you read on.\n",
    });
    expect(main(["node"], io)).toBe(1);
    expect(io.logs).toEqual([
      'docs/README.md:3: "you": name who acts (neutral)',
      'docs/srs.md:4: "you": name who acts (neutral)',
      "\n2 problems: docs/style.md#the-prose-check says what each rule asks.",
    ]);
  });

  it("checks only the pages named, with or without docs/", () => {
    const io = fakeIo({ "srs.md": "# SRS\n\nIf you read on.\n", "guide.md": "# Guide\n\nRead.\n" });
    expect(main(["node", "docs/guide.md"], io)).toBe(0);
    expect(main(["node", "srs.md"], io)).toBe(1);
    expect(io.logs.at(-1)).toBe(
      "\n1 problem: docs/style.md#the-prose-check says what each rule asks.",
    );
  });

  it("stops when the index doesn't parse", () => {
    const io = fakeIo({}, "<srs.md");
    expect(main(["node"], io)).toBe(1);
    expect(io.logs).toEqual(["docs/docs.ttl doesn't parse: npm run check:docs says why."]);
  });
});

describe("the repository's docs", () => {
  it("are checked by the script entry", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const process = {
      argv: ["node", "docs/README.md"],
      exitCode: undefined as number | string | null | undefined,
    };
    run(process);
    expect(process.exitCode).toBe(0);
    expect(log).toHaveBeenCalledWith("1 page follows the prose rules in prose.json.");
    log.mockRestore();
  });

  it("are read from docs/, with the rules in prose.json", () => {
    const io = defaultIo(`${import.meta.dirname}/..`);
    expect(io.pages()).toContain("README.md");
    expect(io.page("README.md")).toContain("# Docs");
    expect(io.index()).toContain("<srs.md>");
    expect(io.rules()).toContain('"rules"');
  });
});
