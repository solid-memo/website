// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { defaultIo, docsIndexProblems, main, run } from "./checkDocs.ts";

const INDEX = `@base <https://solid-memo.com/docs/> .

@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix schema:  <https://schema.org/> .

<>
    a schema:Collection ;
    dcterms:title "Docs"@en .

<#the-code>
    a schema:Collection ;
    dcterms:title "The code"@en ;
    schema:isPartOf <> ;
    schema:position 10 .

<architecture.md>
    a schema:TechArticle ;
    schema:isPartOf <#the-code> ;
    schema:position 10 ;
    dcterms:abstract "the layers."@en .

<boundaries.md>
    a schema:TechArticle ;
    schema:isPartOf <#the-code> ;
    schema:position 30 ;
    dcterms:abstract "the import rules."@en .
`;

const PRIVACY = `docs/privacy.md: docs/docs.ttl does not list the page; add it to a group there, for example:

<privacy.md>
    a schema:TechArticle ;
    schema:isPartOf <#the-code> ;
    schema:position 40 ;
    dcterms:abstract "what the page covers, in one line."@en .
`;

describe("docsIndexProblems", () => {
  it("passes when every page is listed, the README aside", () => {
    expect(docsIndexProblems(["README.md", "architecture.md", "boundaries.md"], INDEX)).toEqual([]);
  });

  it("names a page the index does not list, with its block, and a page it lists that is gone", () => {
    expect(docsIndexProblems(["README.md", "architecture.md", "privacy.md"], INDEX)).toEqual([
      PRIVACY,
      "docs/docs.ttl:22: lists boundaries.md, which is not in docs/",
    ]);
  });

  it("names what is wrong with the index itself", () => {
    expect(
      docsIndexProblems(
        ["README.md", "architecture.md", "boundaries.md"],
        INDEX.replace("schema:position 30", "schema:position 10"),
      ),
    ).toEqual(["docs/docs.ttl:22: <boundaries.md> has the position of <architecture.md>, 10"]);
  });

  it("stops at Turtle that does not parse", () => {
    expect(docsIndexProblems(["README.md", "srs.md"], `${INDEX}<srs.md`)).toEqual([
      expect.stringMatching(/^docs\/docs\.ttl:27: not Turtle: /),
    ]);
  });
});

describe("main", () => {
  function fakeIo(pages: string[]) {
    const logs: string[] = [];
    return {
      logs,
      pages: () => pages,
      index: () => INDEX,
      log: (message: string) => logs.push(message),
    };
  }

  it("says so and returns 0 when the index is whole", () => {
    const io = fakeIo(["README.md", "architecture.md", "boundaries.md"]);
    expect(main(io)).toBe(0);
    expect(io.logs).toEqual(["docs/docs.ttl lists every page in docs/."]);
  });

  it("logs each problem and returns 1", () => {
    const io = fakeIo(["README.md", "architecture.md", "boundaries.md", "privacy.md"]);
    expect(main(io)).toBe(1);
    expect(io.logs).toEqual([PRIVACY]);
  });
});

describe("the repository's docs", () => {
  it("are all listed", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const process = { exitCode: undefined as number | string | null | undefined };
    run(process);
    expect(process.exitCode).toBe(0);
    expect(log).toHaveBeenCalledWith("docs/docs.ttl lists every page in docs/.");
    log.mockRestore();
  });

  it("are read from docs/", () => {
    const io = defaultIo(`${import.meta.dirname}/..`);
    expect(io.pages()).toContain("README.md");
    expect(io.index()).toContain("<srs.md>");
  });
});
