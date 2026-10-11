// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import {
  annotations,
  deckLicenses,
  defaultIo,
  licenseOf,
  main,
  matches,
  run,
  versionProblems,
} from "./checkReuse.ts";

const TOML = `# Comments and settings before the first annotation are not read.
version = 1

[[annotations]]
path = [
    "**/*.md",
    # A comment in the list.
    "decks/index.ttl",
]
precedence = "override"
SPDX-FileCopyrightText = "2026 Anton Wiklund and Solid Memo contributors"
SPDX-License-Identifier = "MIT"

[[annotations]]
path = [
    "decks/periodic-table/*.ttl",
]
SPDX-License-Identifier = "CC0-1.0"

[[annotations]]
path = "decks/swedish-nouns/*.ttl"
SPDX-License-Identifier = "CC-BY-SA-4.0"
`;

const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
const BY_SA = "https://creativecommons.org/licenses/by-sa/4.0/";

/** A deck version as the Turtle formatter writes it, with a card picture's license below. */
function deck(license: string): string {
  return `@base <https://solid-memo.com/decks/periodic-table/v1.ttl> .

@prefix dcterms: <http://purl.org/dc/terms/> .

<>
    a dcat:Dataset ;
    dcterms:title "Periodic table"@en ;
${license}    dcterms:description "The elements."@en .

<#picture>
    dcterms:license <${BY_SA}> .
`;
}

describe("annotations", () => {
  it("reads each annotation's paths, from a list or a string, and its license", () => {
    expect(annotations(TOML)).toEqual([
      { paths: ["**/*.md", "decks/index.ttl"], license: "MIT" },
      { paths: ["decks/periodic-table/*.ttl"], license: "CC0-1.0" },
      { paths: ["decks/swedish-nouns/*.ttl"], license: "CC-BY-SA-4.0" },
    ]);
  });

  it("reads an annotation without a path or a license as such", () => {
    expect(annotations('[[annotations]]\nprecedence = "closest"\n')).toEqual([
      { paths: [], license: undefined },
    ]);
  });
});

describe("matches", () => {
  it("matches * within a folder and ** across folders", () => {
    expect(matches("decks/periodic-table/*.ttl", "decks/periodic-table/v2.ttl")).toBe(true);
    expect(matches("decks/*.ttl", "decks/periodic-table/v2.ttl")).toBe(false);
    expect(matches("**/*.md", "docs/style.md")).toBe(true);
    expect(matches("ns/**", "ns/shapes/deck/v6.ttl")).toBe(true);
  });

  it("takes every other character literally", () => {
    expect(matches("decks/index.ttl", "decks/index.ttl")).toBe(true);
    expect(matches("decks/index.ttl", "decks/indexsttl")).toBe(false);
  });
});

describe("licenseOf", () => {
  it("gives the license of the last annotation that matches, or none", () => {
    const all = annotations(TOML);
    expect(licenseOf(all, "decks/periodic-table/v1.ttl")).toBe("CC0-1.0");
    expect(licenseOf(all, "decks/index.ttl")).toBe("MIT");
    expect(licenseOf(all, "decks/world-rivers/v1.ttl")).toBeUndefined();
  });
});

describe("deckLicenses", () => {
  it("reads the deck's own licenses, not its pictures'", () => {
    expect(deckLicenses(deck(`    dcterms:license <${CC0}> ;\n`))).toEqual([CC0]);
  });

  it("reads several, and none when the deck states none", () => {
    expect(
      deckLicenses(deck(`    dcterms:license <${CC0}> ,\n                    <${BY_SA}> ;\n`)),
    ).toEqual([CC0, BY_SA]);
    expect(deckLicenses(deck(""))).toEqual([]);
  });

  it("reads a deck that ends the file", () => {
    expect(deckLicenses(`<>\n    dcterms:license <${CC0}> .`)).toEqual([CC0]);
  });
});

describe("versionProblems", () => {
  const all = annotations(TOML);

  it("passes a version licensed in REUSE.toml as it says", () => {
    expect(
      versionProblems("decks/periodic-table/v1.ttl", deck(`    dcterms:license <${CC0}> ;\n`), all),
    ).toEqual([]);
  });

  it("names a version REUSE.toml licenses otherwise, or not at all", () => {
    expect(
      versionProblems(
        "decks/periodic-table/v2.ttl",
        deck(`    dcterms:license <${BY_SA}> ;\n`),
        all,
      ),
    ).toEqual([
      "decks/periodic-table/v2.ttl: REUSE.toml says CC0-1.0, but its dcterms:license is CC-BY-SA-4.0.",
    ]);
    expect(
      versionProblems("decks/world-rivers/v1.ttl", deck(`    dcterms:license <${CC0}> ;\n`), all),
    ).toEqual(["decks/world-rivers/v1.ttl: not in REUSE.toml; list its deck under CC0-1.0."]);
  });

  it("names a license it has no SPDX identifier for", () => {
    expect(
      versionProblems(
        "decks/periodic-table/v1.ttl",
        deck("    dcterms:license <https://example.org/license> ;\n"),
        all,
      ),
    ).toEqual([
      "decks/periodic-table/v1.ttl: <https://example.org/license> has no SPDX identifier in scripts/checkReuse.ts; add it there, and its text to LICENSES/ (reuse download).",
    ]);
  });

  it("names a version that states no license, or more than one", () => {
    expect(versionProblems("decks/periodic-table/v1.ttl", deck(""), all)).toEqual([
      "decks/periodic-table/v1.ttl: states 0 licenses, and this check expects one.",
    ]);
  });
});

describe("main", () => {
  function fakeIo(files: Record<string, string>) {
    const logs: string[] = [];
    return {
      logs,
      toml: () => TOML,
      versions: () => Object.keys(files),
      read: (path: string) => files[path]!,
      log: (message: string) => logs.push(message),
    };
  }

  it("says so and returns 0 when every version agrees", () => {
    const io = fakeIo({
      "decks/periodic-table/v1.ttl": deck(`    dcterms:license <${CC0}> ;\n`),
      "decks/swedish-nouns/v1.ttl": deck(`    dcterms:license <${BY_SA}> ;\n`),
    });
    expect(main(io)).toBe(0);
    expect(io.logs).toEqual(["REUSE.toml licenses all 2 deck versions as they state."]);
  });

  it("logs each problem and returns 1", () => {
    const io = fakeIo({
      "decks/periodic-table/v1.ttl": deck(`    dcterms:license <${BY_SA}> ;\n`),
      "decks/swedish-nouns/v1.ttl": deck(`    dcterms:license <${BY_SA}> ;\n`),
    });
    expect(main(io)).toBe(1);
    expect(io.logs).toEqual([
      "decks/periodic-table/v1.ttl: REUSE.toml says CC0-1.0, but its dcterms:license is CC-BY-SA-4.0.",
    ]);
  });
});

describe("the repository's decks", () => {
  it("are licensed in REUSE.toml as they state", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const process = { exitCode: undefined as number | string | null | undefined };
    run(process);
    expect(process.exitCode).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^REUSE\.toml licenses all \d+ deck/));
    log.mockRestore();
  });

  it("are read from decks/, every version but not the index", () => {
    const io = defaultIo(`${import.meta.dirname}/..`);
    const versions = io.versions();
    expect(versions).toContain("decks/periodic-table/v1.ttl");
    expect(versions).not.toContain("decks/index.ttl");
    expect(io.toml()).toContain("[[annotations]]");
    expect(io.read("decks/periodic-table/v1.ttl")).toContain("dcterms:license");
  });
});
