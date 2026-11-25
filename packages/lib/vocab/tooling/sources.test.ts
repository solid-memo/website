// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fileOf, readSiteTurtle, SHAPES_BASE, SITE, SITE_VENDOR, VOCAB_BASE } from "./sources.ts";
import { DECKS_ROOT, NS_ROOT, VOCAB_ROOT } from "./root.ts";

describe("fileOf", () => {
  it("reads ns/ and decks/ from the repository and vendor/ from this package, without the fragment", () => {
    expect(fileOf(`${VOCAB_BASE}v1.ttl#Card`)).toBe(`${NS_ROOT}vocab/v1.ttl`);
    expect(fileOf(`${SHAPES_BASE}card/v1.ttl`)).toBe(`${NS_ROOT}shapes/card/v1.ttl`);
    expect(fileOf(`${SITE}decks/index.ttl#capitals`)).toBe(`${DECKS_ROOT}index.ttl`);
    expect(fileOf(`${SITE_VENDOR}skohub/skos.shacl.ttl`)).toBe(
      `${VOCAB_ROOT}vendor/skohub/skos.shacl.ttl`,
    );
  });

  it("knows no other document", () => {
    expect(fileOf(`${SITE}index.html`)).toBeUndefined();
    expect(fileOf("https://pod.example/ns/vocab/v1.ttl")).toBeUndefined();
  });
});

describe("readSiteTurtle", () => {
  it("reads a document from disk, failing on one the repository does not publish or have", async () => {
    expect(await readSiteTurtle(`${VOCAB_BASE}v1.ttl`)).toContain(`@base <${VOCAB_BASE}v1.ttl> .`);
    await expect(readSiteTurtle("https://pod.example/x.ttl")).rejects.toThrow(
      "https://pod.example/x.ttl is not published from this repository.",
    );
    await expect(readSiteTurtle(`${SHAPES_BASE}no-such-shape/v1.ttl`)).rejects.toThrow("ENOENT");
  });
});
