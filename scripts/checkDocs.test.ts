// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { defaultIo, docsIndexProblems, main, run, scriptProblems } from "./checkDocs.ts";

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
    schema:learningResourceType "reference" ;
    dcterms:abstract "the layers."@en .

<boundaries.md>
    a schema:TechArticle ;
    schema:isPartOf <#the-code> ;
    schema:position 30 ;
    schema:learningResourceType "reference" ;
    dcterms:abstract "the import rules."@en .
`;

const PRIVACY = `docs/privacy.md: docs/docs.ttl does not list the page; add it to a group there, for example:

<privacy.md>
    a schema:TechArticle ;
    schema:isPartOf <#the-code> ;
    schema:position 40 ;
    schema:learningResourceType "reference" ;
    dcterms:abstract "what the page covers, in one line."@en .
`;

describe("docsIndexProblems", () => {
  it("passes when every page is listed, the README aside", () => {
    expect(docsIndexProblems(["README.md", "architecture.md", "boundaries.md"], INDEX)).toEqual([]);
  });

  it("names a page the index does not list, with its block, and a page it lists that is gone", () => {
    expect(docsIndexProblems(["README.md", "architecture.md", "privacy.md"], INDEX)).toEqual([
      PRIVACY,
      "docs/docs.ttl:23: lists boundaries.md, which is not in docs/",
    ]);
  });

  it("names what is wrong with the index itself", () => {
    expect(
      docsIndexProblems(
        ["README.md", "architecture.md", "boundaries.md"],
        INDEX.replace("schema:position 30", "schema:position 10"),
      ),
    ).toEqual(["docs/docs.ttl:23: <boundaries.md> has the position of <architecture.md>, 10"]);
  });

  it("stops at Turtle that does not parse", () => {
    expect(docsIndexProblems(["README.md", "srs.md"], `${INDEX}<srs.md`)).toEqual([
      expect.stringMatching(/^docs\/docs\.ttl:29: not Turtle: /),
    ]);
  });
});

const SCRIPTS = {
  root: ["dev", "start", "check:docs"],
  workspaces: { "@solid-memo/web": ["preview"] },
};

describe("scriptProblems", () => {
  it("passes a script of the root package, and one of the workspace -w names", () => {
    const markdown = new Map([
      [
        "docs/deployment.md",
        "`npm run dev`, `npm run check:docs`,\n`npm run preview -w\n@solid-memo/web`, `npm run preview --workspace=@solid-memo/web -- --open`",
      ],
    ]);
    expect(scriptProblems(markdown, SCRIPTS)).toEqual([]);
  });

  it("names a script the package does not have, and a workspace there is not, by line", () => {
    const markdown = new Map([
      [
        "README.md",
        "Run it:\n\n```sh\nnpm run preview\nnpm run dev -w @solid-memo/web\nnpm run dev -w @solid-memo/gone\n```\n",
      ],
    ]);
    expect(scriptProblems(markdown, SCRIPTS)).toEqual([
      "README.md:4: npm run preview: the root package.json has no such script",
      "README.md:5: npm run dev -w @solid-memo/web: the workspace has no such script",
      "README.md:6: npm run dev -w @solid-memo/gone: no such workspace",
    ]);
  });

  it("reads a placeholder as no script, and leaves the changelog out", () => {
    const markdown = new Map([
      ["docs/testing.md", "`npm run <script>`"],
      ["CHANGELOG.md", "* rename `npm run preview` to `npm start`"],
    ]);
    expect(scriptProblems(markdown, SCRIPTS)).toEqual([]);
  });
});

describe("main", () => {
  function fakeIo(pages: string[], markdown = "`npm run dev`") {
    const logs: string[] = [];
    return {
      logs,
      pages: () => pages,
      index: () => INDEX,
      markdown: () => new Map([["README.md", markdown]]),
      scripts: () => SCRIPTS,
      log: (message: string) => logs.push(message),
    };
  }

  it("says so and returns 0 when the index is whole", () => {
    const io = fakeIo(["README.md", "architecture.md", "boundaries.md"]);
    expect(main(io)).toBe(0);
    expect(io.logs).toEqual([
      "docs/docs.ttl lists every page in docs/, and every npm run in the Markdown names a script.",
    ]);
  });

  it("logs each problem and returns 1", () => {
    const io = fakeIo(["README.md", "architecture.md", "boundaries.md", "privacy.md"]);
    expect(main(io)).toBe(1);
    expect(io.logs).toEqual([PRIVACY]);
  });

  it("logs a script that is not there and returns 1", () => {
    const io = fakeIo(["README.md", "architecture.md", "boundaries.md"], "`npm run preview`");
    expect(main(io)).toBe(1);
    expect(io.logs).toEqual([
      "README.md:1: npm run preview: the root package.json has no such script",
    ]);
  });
});

describe("the repository's docs", () => {
  it("are all listed, and name scripts that are there", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const process = { exitCode: undefined as number | string | null | undefined };
    run(process);
    expect(process.exitCode).toBe(0);
    expect(log).toHaveBeenCalledWith(
      "docs/docs.ttl lists every page in docs/, and every npm run in the Markdown names a script.",
    );
    log.mockRestore();
  });

  it("are read from docs/", () => {
    const io = defaultIo(`${import.meta.dirname}/..`);
    expect(io.pages()).toContain("README.md");
    expect(io.index()).toContain("<srs.md>");
    expect(io.markdown().get("AGENTS.md")).toContain("npm run check");
    const scripts = io.scripts();
    expect(scripts.root).toContain("dev");
    expect(scripts.workspaces["@solid-memo/web"]).toContain("preview");
  });
});
