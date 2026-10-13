// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { defaultIo, isReleaseVersion, main, run, setKeys, TARGETS } from "./releaseVersion.ts";

const PUBLICCODE = `publiccodeYmlVersion: "0"

name: Solid Memo
url: https://github.com/solid-memo/website
landingURL: https://solid-memo.com/

developmentStatus: stable
`;

const CITATION = `cff-version: 1.2.0
title: Solid Memo
url: https://solid-memo.com/
license: MIT
`;

describe("isReleaseVersion", () => {
  it("takes MAJOR.MINOR.PATCH", () => {
    expect(isReleaseVersion("1.0.0")).toBe(true);
    expect(isReleaseVersion("12.30.4")).toBe(true);
  });

  it("refuses a prerelease, a leading zero, a v and a partial version", () => {
    expect(isReleaseVersion("1.0.0-rc.1")).toBe(false);
    expect(isReleaseVersion("01.0.0")).toBe(false);
    expect(isReleaseVersion("v1.0.0")).toBe(false);
    expect(isReleaseVersion("1.0")).toBe(false);
  });
});

describe("setKeys", () => {
  it("adds new keys after the anchor, in order", () => {
    expect(
      setKeys(PUBLICCODE, "landingURL", [
        ["softwareVersion", "1.0.0"],
        ["releaseDate", '"2026-10-13"'],
      ]),
    ).toBe(`publiccodeYmlVersion: "0"

name: Solid Memo
url: https://github.com/solid-memo/website
landingURL: https://solid-memo.com/
softwareVersion: 1.0.0
releaseDate: "2026-10-13"

developmentStatus: stable
`);
  });

  it("replaces keys that are there, wherever they are", () => {
    const released = `version: "1.0.0"\n${CITATION}date-released: "2026-10-13"\n`;
    expect(
      setKeys(released, "url", [
        ["version", '"1.1.0"'],
        ["date-released", '"2026-11-01"'],
      ]),
    ).toBe(`version: "1.1.0"\n${CITATION}date-released: "2026-11-01"\n`);
  });

  it("reads a key as a whole key, not the start of a longer one", () => {
    expect(setKeys("urls: []\nurl: a\n", "url", [["version", "1"]])).toBe(
      "urls: []\nurl: a\nversion: 1\n",
    );
  });

  it("throws when a new key has no anchor to follow", () => {
    expect(() => setKeys(CITATION, "landingURL", [["version", "1"]])).toThrow(
      "no landingURL: line to write version: after",
    );
  });
});

describe("main", () => {
  function fakeIo(files: Record<string, string>) {
    const logs: string[] = [];
    return {
      files,
      logs,
      read: (path: string) => {
        const text = files[path];
        if (text === undefined) throw new Error(`ENOENT: ${path}`);
        return text;
      },
      write: (path: string, text: string) => {
        files[path] = text;
      },
      today: () => "2026-10-13",
      log: (message: string) => logs.push(message),
    };
  }

  it("writes the version and today's date into every file", () => {
    const io = fakeIo({ "publiccode.yml": PUBLICCODE, "CITATION.cff": CITATION });
    expect(main(["node", "1.0.0"], io)).toBe(0);
    expect(io.files["publiccode.yml"]).toContain(
      'landingURL: https://solid-memo.com/\nsoftwareVersion: 1.0.0\nreleaseDate: "2026-10-13"\n',
    );
    expect(io.files["CITATION.cff"]).toContain(
      'url: https://solid-memo.com/\nversion: "1.0.0"\ndate-released: "2026-10-13"\n',
    );
    expect(io.logs).toEqual([
      "publiccode.yml: version 1.0.0, released 2026-10-13.",
      "CITATION.cff: version 1.0.0, released 2026-10-13.",
    ]);
  });

  it("refuses anything but one release version, and writes nothing", () => {
    for (const argv of [["node"], ["node", "1.0.0-beta.1"], ["node", "1.0.0", "1.1.0"]]) {
      const io = fakeIo({ "publiccode.yml": PUBLICCODE, "CITATION.cff": CITATION });
      expect(main(argv, io)).toBe(2);
      expect(io.files["publiccode.yml"]).toBe(PUBLICCODE);
      expect(io.logs).toEqual(["Usage: npm run release:version -- <MAJOR.MINOR.PATCH>"]);
    }
  });

  it("names the file it could not write, and returns 1", () => {
    const io = fakeIo({ "publiccode.yml": "name: Solid Memo\n", "CITATION.cff": CITATION });
    expect(main(["node", "1.0.0"], io)).toBe(1);
    expect(io.logs).toEqual([
      "publiccode.yml: no landingURL: line to write softwareVersion: after.",
    ]);
    expect(io.files["CITATION.cff"]).toBe(CITATION);
  });
});

describe("the repository's metadata", () => {
  it("has each anchor, so a release can write its version", () => {
    const io = defaultIo(`${import.meta.dirname}/..`);
    for (const target of TARGETS) {
      expect(() =>
        setKeys(io.read(target.path), target.after, target.keys("1.0.0", "2026-10-13")),
      ).not.toThrow();
    }
  });

  it("is read from the repository, and dated today in UTC", () => {
    const io = defaultIo(`${import.meta.dirname}/..`);
    expect(io.read("publiccode.yml")).toContain("name: Solid Memo");
    expect(io.today()).toBe(new Date().toISOString().slice(0, 10));
  });

  it("is written where it is read", () => {
    const dir = mkdtempSync(join(tmpdir(), "release-version-"));
    try {
      const io = defaultIo(dir);
      io.write("CITATION.cff", CITATION);
      expect(io.read("CITATION.cff")).toBe(CITATION);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("is left alone by a run without a version", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const process = { argv: ["node"], exitCode: undefined as number | string | null | undefined };
    run(process);
    expect(process.exitCode).toBe(2);
    expect(log).toHaveBeenCalledWith("Usage: npm run release:version -- <MAJOR.MINOR.PATCH>");
    log.mockRestore();
  });
});
