// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DECKS_ROOT } from "@solid-memo/vocab/tooling/root";
import { afterEach, describe, expect, it } from "vitest";
import { deckReadOf, indexOfListedDecks, LIBRARY_DECKS, takeUnlistedReads } from "./libraryDecks";

/** A deck of the library that LIBRARY_DECKS doesn't list. */
const OTHER = "vim-commands";

describe("LIBRARY_DECKS", () => {
  it("are solid#test's inputs from decks/, and no more of it", () => {
    const turbo = JSON.parse(readFileSync(join(import.meta.dirname, "../../turbo.json"), "utf8"));
    const inputs: string[] = turbo.tasks.test.inputs;
    const decks = inputs
      .filter((input) => input.startsWith("$TURBO_ROOT$/decks/"))
      .map((input) => input.slice("$TURBO_ROOT$/decks/".length));
    expect(decks).toEqual(LIBRARY_DECKS.map((deck) => `${deck}/**`));
  });

  it("are decks of the library, sorted", () => {
    expect([...LIBRARY_DECKS].sort()).toEqual(LIBRARY_DECKS);
    for (const deck of LIBRARY_DECKS) {
      expect(readdirSync(join(DECKS_ROOT, deck))).toContain("v1.ttl");
    }
  });
});

describe("deckReadOf", () => {
  const exists = (path: string) => !path.endsWith("/nothing");

  it("tells the index, a listed deck, a deck that isn't there and another deck apart", () => {
    expect(deckReadOf(join(DECKS_ROOT, "index.ttl"), exists)).toBe("index");
    expect(deckReadOf(join(DECKS_ROOT, "greek-alphabet/v1.ttl"), exists)).toBe("listed");
    expect(deckReadOf(join(DECKS_ROOT, "nothing/v1.ttl"), exists)).toBe("missing");
    expect(deckReadOf(join(DECKS_ROOT, `${OTHER}/v1.ttl`), exists)).toBe("unlisted");
    expect(deckReadOf(DECKS_ROOT, exists)).toBe("unlisted");
  });

  it("leaves what is outside decks/ alone", () => {
    expect(deckReadOf(join(DECKS_ROOT, "../ns/vocab/v1.ttl"), exists)).toBe("outside");
    expect(deckReadOf(join(DECKS_ROOT, "../decks-elsewhere/x.ttl"), exists)).toBe("outside");
  });
});

describe("a unit test's reads of the library", () => {
  afterEach(() => {
    takeUnlistedReads();
  });

  it("read the index as of the listed decks alone", async () => {
    const index = readFileSync(join(DECKS_ROOT, "index.ttl"), "utf8");
    expect(index).toBe(indexOfListedDecks());
    expect(await readFile(join(DECKS_ROOT, "index.ttl"), "utf8")).toBe(index);
    expect(readFileSync(join(DECKS_ROOT, "index.ttl"))).toEqual(Buffer.from(index));
    for (const deck of LIBRARY_DECKS) expect(index).toContain(`<#${deck}>`);
    expect(index).not.toContain(OTHER);
  });

  it("read a listed deck's release as it is", async () => {
    const path = join(DECKS_ROOT, "greek-alphabet/v1.ttl");
    expect(await readFile(path, "utf8")).toBe(readFileSync(path, "utf8"));
    expect(readFileSync(path, "utf8")).toContain("@base");
  });

  it("fail for another deck, or the whole library, and are kept for the setup to fail the test", async () => {
    expect(() => readFileSync(join(DECKS_ROOT, `${OTHER}/v1.ttl`), "utf8")).toThrow(
      /LIBRARY_DECKS/,
    );
    await expect(readFile(join(DECKS_ROOT, `${OTHER}/v1.ttl`))).rejects.toThrow(/LIBRARY_DECKS/);
    expect(() => readdirSync(DECKS_ROOT)).toThrow(/LIBRARY_DECKS/);
    expect(takeUnlistedReads()).toEqual([
      `decks/${OTHER}/v1.ttl`,
      `decks/${OTHER}/v1.ttl`,
      "decks/",
    ]);
  });

  it("read a release that isn't there as missing", () => {
    expect(() => readFileSync(join(DECKS_ROOT, "nothing/v1.ttl"), "utf8")).toThrow(/ENOENT/);
    expect(takeUnlistedReads()).toEqual([]);
  });
});
