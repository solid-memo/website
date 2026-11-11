// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { CustomPalette } from "@solid-memo/domain/customPalette";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { describe, expect, it } from "vitest";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import { createSolidPaletteRepository } from "./solidPaletteRepository";
import { fakePod } from "./testing/fakePod";
import { SM, SM_NS } from "./vocab";

/**
 * A palette's color sets are written where the color set's closed shape
 * accepts them, whatever another app put in the palettes document: each
 * save goes through the real mapper, repository and write check, against
 * a pod in memory.
 */

const INSTANCE = "https://pod.example/solid-memo/main/";
const DOCUMENT = `${INSTANCE}palettes.ttl`;
const PREFIXES = `@prefix sm: <${SM_NS}> .
@prefix dcterms: <http://purl.org/dc/terms/> .
`;
const P = `${DOCUMENT}#p`;
const paletteOf = (light: string, dark = "<#p-dark>") =>
  `<#p> a sm:Palette ; sm:formatVersion 1 ; dcterms:title "Mine"@en ;
  sm:basedOn sm:standardPalette ; sm:lightColors ${light} ; sm:darkColors ${dark} .\n`;
const MINE: CustomPalette = {
  url: P,
  title: { en: "Renamed" },
  basedOn: "standard",
  light: { "--bg": "#445566" },
  dark: { "--text": "#eeeeee" },
};

async function save(document: string, palette = MINE) {
  const pod = fakePod();
  await pod.put(DOCUMENT, `${PREFIXES}${document}`);
  const validator = createShaclShapeValidator({
    fetch: pod.fetch,
    shapesFetch,
    ...SHAPE_SOURCES,
  }).over(pod.fetch);
  const repository = createSolidPaletteRepository({
    fetch: pod.fetch,
    checkWrite: validator.checkSubjects,
  });
  await repository.savePalette(INSTANCE, palette);
  return { triples: pod.triples(DOCUMENT)!.join("\n"), palettes: repository.listPalettes };
}

describe("a palette's color sets", () => {
  it("are saved again when another app added a property to one, without that property", async () => {
    const { triples, palettes } = await save(
      `${paletteOf("<#p-light>")}<#p-light> a sm:ColorSet ; sm:formatVersion 1 ;
        sm:backgroundColor "#112233" ; <https://other.example/note> "x" .
      <#p-dark> a sm:ColorSet ; sm:formatVersion 1 .`,
    );
    expect(triples).toContain(`<${P}> <${SM.lightColors}> <${P}-light>`);
    expect(triples).toContain(`<${P}-light> <${SM.backgroundColor}> "#445566"`);
    expect(triples).not.toContain("https://other.example/note");
    expect(await palettes(INSTANCE)).toEqual([MINE]);
  });

  it("are never written at the palette itself", async () => {
    const { triples, palettes } = await save(paletteOf("<#p>"));
    expect(triples).toContain(`<${P}> <${SM.lightColors}> <${P}-light>`);
    expect(triples).not.toContain(`<${P}> <${SM.backgroundColor}>`);
    expect(await palettes(INSTANCE)).toEqual([MINE]);
  });

  it("leave another palette's color set as it is, at the next free address", async () => {
    const { triples, palettes } = await save(
      `${paletteOf("<#shared>", "<#shared>")}
      <#q> a sm:Palette ; sm:formatVersion 1 ; dcterms:title "Theirs"@en ;
        sm:basedOn sm:standardPalette ; sm:lightColors <#shared> ; sm:darkColors <#p-light> .
      <#shared> a sm:ColorSet ; sm:formatVersion 1 ; sm:backgroundColor "#112233" .
      <#p-light> a sm:ColorSet ; sm:formatVersion 1 ; sm:textColor "#000000" .`,
    );
    expect(triples).toContain(`<${P}> <${SM.lightColors}> <${P}-light-2>`);
    expect(triples).toContain(`<${P}> <${SM.darkColors}> <${P}-dark>`);
    expect(triples).toContain(`<${DOCUMENT}#shared> <${SM.backgroundColor}> "#112233"`);
    expect(triples).toContain(`<${P}-light> <${SM.textColor}> "#000000"`);
    const read = await palettes(INSTANCE);
    expect(read.find((palette) => palette.url === P)).toEqual(MINE);
    expect(read.find((palette) => palette.url === `${DOCUMENT}#q`)).toMatchObject({
      light: { "--bg": "#112233" },
      dark: { "--text": "#000000" },
    });
  });

  it("are not two themes at one address, nor at a subject of another class", async () => {
    const { triples } = await save(
      `${paletteOf("<#both>", "<#both>")}<#both> a sm:ColorSet ; sm:formatVersion 1 .
      <#p-dark> a sm:ColorSet, <http://xmlns.com/foaf/0.1/Document> .`,
    );
    expect(triples).toContain(`<${P}> <${SM.lightColors}> <${DOCUMENT}#both>`);
    expect(triples).toContain(`<${P}> <${SM.darkColors}> <${P}-dark-2>`);
    expect(triples).toContain(
      `<${P}-dark> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://xmlns.com/foaf/0.1/Document>`,
    );
    expect(triples).not.toContain(`<${P}-dark> <${SM.textColor}>`);
  });

  it("are not written at a subject of another class only", async () => {
    const { triples } = await save(
      `${paletteOf("<#note>")}<#note> a <http://xmlns.com/foaf/0.1/Document> .`,
    );
    expect(triples).toContain(`<${P}> <${SM.lightColors}> <${P}-light>`);
    expect(triples).not.toContain(`<${DOCUMENT}#note> <${SM.backgroundColor}>`);
  });

  it("are saved again when another app made the palette a color set too, without that class", async () => {
    const { triples, palettes } = await save(
      paletteOf("<#p-light>").replace("a sm:Palette", "a sm:Palette, sm:ColorSet"),
    );
    expect(triples).not.toContain(
      `<${P}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <${SM.ColorSet}>`,
    );
    expect(await palettes(INSTANCE)).toEqual([MINE]);
  });

  it("pass by a subject the palette does not name that a newer version of the app wrote", async () => {
    const { triples, palettes } = await save(
      `${paletteOf("<#p>")}<#p-light> a sm:ColorSet ; sm:formatVersion 2 .`,
    );
    expect(triples).toContain(`<${P}> <${SM.lightColors}> <${P}-light-2>`);
    expect(await palettes(INSTANCE)).toEqual([MINE]);
  });

  it("are not written over when a newer version of the app wrote them", async () => {
    await expect(
      save(`${paletteOf("<#p-light>")}<#p-light> a sm:ColorSet ; sm:formatVersion 2 .`),
    ).rejects.toMatchObject({ code: "writtenByNewerApp" });
  });
});
