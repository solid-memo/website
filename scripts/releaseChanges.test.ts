// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addedEntry, type Change, unexpectedChanges } from "./releaseChanges.ts";

const ROOT = join(import.meta.dirname, "..");
const { changelogTitle } = (await import(
  new URL("../release.config.mjs", import.meta.url).href
)) as {
  changelogTitle: string;
};

const ENTRY = [
  "## [1.0.1](https://github.com/solid-memo/website/compare/v1.0.0...v1.0.1) (2026-11-19)",
  "",
  "### Fixes",
  "",
  "* **solid:** keep the deck ([abc1234](https://github.com/solid-memo/website/commit/abc1234))",
].join("\n");

const OLD_ENTRIES =
  "## [1.0.0](https://github.com/solid-memo/website/compare/v0.9.0...v1.0.0) (2026-01-01)\n\n* start\n";

/** The five files as main's tip has them, and as a release of 1.0.1 writes them. */
function release(): Change[] {
  return [
    {
      path: "package.json",
      before:
        '{\n  "name": "x",\n  "version": "1.0.0",\n  "scripts": {\n    "version": "echo"\n  }\n}\n',
      after:
        '{\n  "name": "x",\n  "version": "1.0.1",\n  "scripts": {\n    "version": "echo"\n  }\n}\n',
    },
    {
      path: "package-lock.json",
      before: lock("1.0.0", "1.0.0", "2.0.0"),
      after: lock("1.0.1", "1.0.1", "2.0.0"),
    },
    {
      path: "publiccode.yml",
      before: 'landingURL: https://x/\nsoftwareVersion: 1.0.0\nreleaseDate: "2026-01-01"\n',
      after: 'landingURL: https://x/\nsoftwareVersion: 1.0.1\nreleaseDate: "2026-11-19"\n',
    },
    {
      path: "CITATION.cff",
      before: 'url: https://x/\nversion: "1.0.0"\ndate-released: "2026-01-01"\n',
      after: 'url: https://x/\nversion: "1.0.1"\ndate-released: "2026-11-19"\n',
    },
    {
      path: "CHANGELOG.md",
      before: `${changelogTitle}\n\n${OLD_ENTRIES}`,
      after: `${changelogTitle}\n\n${ENTRY}\n\n${OLD_ENTRIES}`,
    },
  ];
}

/** A lockfile: its version, its root package's, and a dependency's. */
function lock(top: string, root: string, dependency: string): string {
  return `{
  "name": "x",
  "version": "${top}",
  "lockfileVersion": 3,
  "packages": {
    "": {
      "name": "x",
      "version": "${root}",
      "license": "MIT"
    },
    "node_modules/a": {
      "version": "${dependency}"
    }
  }
}
`;
}

/** The release, with one file's text after it replaced. */
function changing(path: string, after: (text: string) => string): Change[] {
  return release().map((change) =>
    change.path === path ? { ...change, after: after(change.after) } : change,
  );
}

describe("addedEntry", () => {
  const before = `${changelogTitle}\n\n${OLD_ENTRIES}`;

  it("is the entry the changelog plugin writes between the header and the older entries", () => {
    expect(addedEntry(before, `${changelogTitle}\n\n${ENTRY}\n\n${OLD_ENTRIES}`)).toBe(ENTRY);
  });

  it("is undefined for anything else", () => {
    for (const after of [
      `# Another\n\n${ENTRY}\n\n${OLD_ENTRIES}`,
      `${changelogTitle}\n\n${ENTRY}\n\n${OLD_ENTRIES.replace("start", "begin")}`,
      `${changelogTitle}\n\n${ENTRY}\n${OLD_ENTRIES}`,
      `${changelogTitle}\n\n\n\n${OLD_ENTRIES}`,
      `${changelogTitle}\n\n${ENTRY}\n\n\n${OLD_ENTRIES}`,
    ]) {
      expect(addedEntry(before, after), after).toBeUndefined();
    }
    expect(addedEntry(OLD_ENTRIES, OLD_ENTRIES)).toBeUndefined();
  });
});

describe("unexpectedChanges", () => {
  it("finds nothing in what a release writes", () => {
    expect(unexpectedChanges(release(), "1.0.1")).toEqual([]);
  });

  // The repository's own files, with the version and date written in as
  // a release writes them: the patterns find their lines.
  it("finds nothing in a release of the repository's own files", () => {
    const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
    const version = "99.0.0";
    const date = "2099-01-02";
    const entry = `## [${version}](https://github.com/solid-memo/website/compare/v1.0.0...v${version}) (${date})\n\n* a fix`;
    const changelog = read("CHANGELOG.md");
    const changes: Change[] = [
      {
        path: "package.json",
        before: read("package.json"),
        after: read("package.json").replace(/^ {2}"version": ".*"/m, `  "version": "${version}"`),
      },
      {
        path: "package-lock.json",
        before: read("package-lock.json"),
        after: read("package-lock.json")
          .replace(/^ {2}"version": ".*"/m, `  "version": "${version}"`)
          .replace(
            /^( {4}"": \{\n {6}"name": .*\n) {6}"version": ".*"/m,
            `$1      "version": "${version}"`,
          ),
      },
      {
        path: "publiccode.yml",
        before: read("publiccode.yml"),
        after: read("publiccode.yml")
          .replace(/^softwareVersion: .*$/m, `softwareVersion: ${version}`)
          .replace(/^releaseDate: .*$/m, `releaseDate: "${date}"`),
      },
      {
        path: "CITATION.cff",
        before: read("CITATION.cff"),
        after: read("CITATION.cff")
          .replace(/^version: .*$/m, `version: "${version}"`)
          .replace(/^date-released: .*$/m, `date-released: "${date}"`),
      },
      {
        path: "CHANGELOG.md",
        before: changelog,
        after: `${changelogTitle}\n\n${entry}\n\n${changelog.slice(changelogTitle.length + 2)}`,
      },
    ];
    for (const change of changes) expect(change.after, change.path).not.toBe(change.before);
    expect(unexpectedChanges(changes, version)).toEqual([]);
  });

  it("finds a file a release never writes, and one it left as it was", () => {
    const changes = [
      ...release().filter((change) => change.path !== "CITATION.cff"),
      { path: "scripts/check.ts", before: "a", after: "b" },
    ];
    expect(unexpectedChanges(changes, "1.0.1")).toEqual([
      "scripts/check.ts: a release never writes it",
      "CITATION.cff: unchanged",
    ]);
  });

  it("checks nothing more without a changelog", () => {
    const changes = changing("package.json", (text) => `${text} `).filter(
      (change) => change.path !== "CHANGELOG.md",
    );
    expect(unexpectedChanges(changes, "1.0.1")).toEqual(["CHANGELOG.md: unchanged"]);
  });

  it("finds a changelog with more than one new entry under its header", () => {
    const changes = changing("CHANGELOG.md", (text) => text.replace("* start", "* begun"));
    expect(unexpectedChanges(changes, "1.0.1")).toEqual([
      "CHANGELOG.md: not one new entry under its header",
    ]);
  });

  it("finds an entry headed by another version, or with no date", () => {
    expect(unexpectedChanges(release(), "1.0.2")).toEqual([
      "CHANGELOG.md: its new entry is not headed 1.0.2 and a date",
    ]);
    const undated = changing("CHANGELOG.md", (text) => text.replace(" (2026-11-19)", ""));
    expect(unexpectedChanges(undated, "1.0.1")).toEqual([
      "CHANGELOG.md: its new entry is not headed 1.0.1 and a date",
    ]);
  });

  it("finds anything but the version changed in package.json and package-lock.json", () => {
    const changes = release().map((change) => {
      if (change.path === "package.json") {
        return { ...change, after: change.after.replace('"echo"', '"curl evil"') };
      }
      if (change.path === "package-lock.json") {
        return { ...change, after: lock("1.0.1", "1.0.1", "6.6.6") };
      }
      return change;
    });
    expect(unexpectedChanges(changes, "1.0.1")).toEqual([
      "package.json: changes more than the version and the date",
      "package-lock.json: changes more than the version and the date",
    ]);
  });

  it("finds a package.json or package-lock.json with no version to write", () => {
    const changes = release().map((change) => {
      if (change.path === "package.json") return { ...change, before: '{\n  "name": "x"\n}\n' };
      if (change.path === "package-lock.json") {
        return { ...change, before: change.before.replace('      "version": "1.0.0",\n', "") };
      }
      return change;
    });
    expect(unexpectedChanges(changes, "1.0.1")).toEqual([
      "package.json: changes more than the version and the date",
      "package-lock.json: changes more than the version and the date",
    ]);
  });

  it("finds a date other than the entry's, or a key the release does not write", () => {
    const changes = release().map((change) => {
      if (change.path === "CITATION.cff") {
        return { ...change, after: change.after.replace("2026-11-19", "2026-11-20") };
      }
      if (change.path === "publiccode.yml") {
        return { ...change, after: `${change.after}name: Other\n` };
      }
      return change;
    });
    expect(unexpectedChanges(changes, "1.0.1")).toEqual([
      "publiccode.yml: changes more than the version and the date",
      "CITATION.cff: changes more than the version and the date",
    ]);
  });

  it("finds a file the version cannot be written into", () => {
    const changes = release().map((change) =>
      change.path === "publiccode.yml" ? { ...change, before: "name: x\n" } : change,
    );
    expect(unexpectedChanges(changes, "1.0.1")).toEqual([
      "publiccode.yml: changes more than the version and the date",
    ]);
  });
});
