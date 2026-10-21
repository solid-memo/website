// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import type { CustomPalette } from "@solid-memo/domain/customPalette";
import { createSolidPaletteRepository } from "./solidPaletteRepository";
import { fakePod } from "./testing/fakePod";
import { SM, SM_NS } from "./vocab";

const INSTANCE = "https://pod.example/solid-memo/main/";
const DOCUMENT = `${INSTANCE}palettes.ttl`;
const PREFIXES = `@prefix sm: <${SM_NS}> .
@prefix dcterms: <http://purl.org/dc/terms/> .
`;

const READING: CustomPalette = {
  url: `${DOCUMENT}#palette-reading`,
  title: { en: "Reading", sv: "Läsning" },
  basedOn: "parchment",
  light: { "--bg": "#f4ecd8", "--text": "#2b2118" },
  dark: {},
};

describe("the palettes in the pod", () => {
  it("are none without a palettes document", async () => {
    await expect(
      createSolidPaletteRepository({ fetch: fakePod().fetch }).listPalettes(INSTANCE),
    ).resolves.toEqual([]);
  });

  it("are read as the document states them, each color held to #rrggbb", async () => {
    const pod = fakePod();
    await pod.put(
      DOCUMENT,
      `${PREFIXES}
      <#palette-reading> a sm:Palette ; sm:formatVersion 1 ;
        dcterms:title "Reading"@en, "Läsning"@sv ; sm:basedOn sm:parchmentPalette ;
        sm:lightColors <#palette-reading-light> ; sm:darkColors <#palette-reading-dark> .
      <#palette-reading-light> a sm:ColorSet ; sm:backgroundColor "#F4ECD8" ; sm:textColor "#2b2118" ;
        sm:linkColor "url(https://evil.example/x)" ; sm:dangerColor "#fff" .
      <#palette-later> a sm:Palette ; dcterms:title "Later"@en ; sm:basedOn sm:sepiaPalette ;
        sm:lightColors <https://evil.example/colors#light> ; sm:darkColors <#untyped> .
      <#untyped> sm:textColor "#000000" .
      <#palette-untitled> a sm:Palette ; sm:basedOn sm:standardPalette ;
        sm:lightColors <#a> ; sm:darkColors <#b> .
      <https://evil.example/colors#light> a sm:ColorSet ; sm:textColor "#ffffff" .
      <https://evil.example/palettes#outside> a sm:Palette ; sm:formatVersion 1 ;
        dcterms:title "Outside"@en ; sm:basedOn sm:standardPalette ;
        sm:lightColors <#palette-reading-light> ; sm:darkColors <#palette-reading-dark> .`,
    );
    const palettes = await createSolidPaletteRepository({ fetch: pod.fetch }).listPalettes(
      INSTANCE,
    );
    expect(palettes).toEqual([
      // A color not written #rrggbb is left out, whatever the shape said of it.
      { ...READING, light: { "--bg": "#f4ecd8", "--text": "#2b2118" } },
      // A palette at an address outside the document is not listed. A base this version
      // does not know is Standard; a color set elsewhere, or none, sets nothing.
      {
        url: `${DOCUMENT}#palette-later`,
        title: { en: "Later" },
        basedOn: "standard",
        light: {},
        dark: {},
      },
    ]);
  });

  it("are written in place, their color sets beside them, keeping what the app does not know", async () => {
    const pod = fakePod();
    await pod.put(
      DOCUMENT,
      `${PREFIXES}
      <#palette-reading> a sm:Palette ; sm:formatVersion 1 ; dcterms:title "Old"@en ;
        sm:basedOn sm:standardPalette ; sm:lightColors <#day> ; sm:darkColors <https://evil.example/x#dark> ;
        <https://other.example/says> "kept" .
      <#day> a sm:ColorSet ; sm:surfaceColor "#ffffff" .`,
    );
    const checkWrite = vi.fn(async () => undefined);
    const repository = createSolidPaletteRepository({ fetch: pod.fetch, checkWrite });
    await repository.savePalette(INSTANCE, READING);

    expect(checkWrite).toHaveBeenCalledWith(
      expect.anything(),
      [READING.url, `${DOCUMENT}#day`, `${READING.url}-dark`],
      "pod",
    );
    const triples = pod.triples(DOCUMENT)!.join("\n");
    expect(triples).toContain(`<${READING.url}> <https://other.example/says> "kept"`);
    // The light colors where the palette named them, the dark ones at its own subject, not elsewhere.
    expect(triples).toContain(`<${READING.url}> <${SM.lightColors}> <${DOCUMENT}#day>`);
    expect(triples).toContain(`<${READING.url}> <${SM.darkColors}> <${READING.url}-dark>`);
    expect(triples).not.toContain(`<${DOCUMENT}#day> <${SM.surfaceColor}>`);
    expect(await repository.listPalettes(INSTANCE)).toEqual([READING]);
    // One PUT of the whole document, made only while it is as read.
    expect(
      pod.requests
        .filter((request) => request.method !== "GET")
        .map(({ method, ifMatch }) => ({
          method,
          ifMatch,
        })),
    ).toEqual([{ method: "PUT", ifMatch: '"v1"' }]);
  });

  it("makes the document for the first palette", async () => {
    const pod = fakePod();
    const repository = createSolidPaletteRepository({ fetch: pod.fetch });
    await repository.savePalette(INSTANCE, READING);
    expect(await repository.listPalettes(INSTANCE)).toEqual([READING]);
    expect(pod.triples(DOCUMENT)).toContain(
      `<${READING.url}-light> <${SM.formatVersion}> "1"^^<http://www.w3.org/2001/XMLSchema#integer> .`,
    );
  });

  it("writes a palette nowhere but in its instance's palettes document", async () => {
    const pod = fakePod();
    await expect(
      createSolidPaletteRepository({ fetch: pod.fetch }).savePalette(INSTANCE, {
        ...READING,
        url: "https://evil.example/palettes.ttl#palette-reading",
      }),
    ).rejects.toThrow("Not a palette of");
    expect(pod.requests).toEqual([]);
  });
});
