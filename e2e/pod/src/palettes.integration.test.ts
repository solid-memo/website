// @vitest-environment node

// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The palettes the user designs against a real Solid server
 * (docs/theme.md, Palettes of one's own): one saved is read back as
 * written, its name in any language, the instance's preferences choose
 * it by its address, and the instance's check finds the palettes
 * document conforming. A palette whose colors break the rules, written
 * straight to the pod, is reported by the check and read without them.
 */
import { describe, expect, inject, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { createUseCases } from "@solid-memo/application/useCases";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidAnswerLog } from "@solid-memo/solid/solidAnswerLog";
import { createSolidDeckRepository } from "@solid-memo/solid/solidDeckRepository";
import { createSolidDigestRepository } from "@solid-memo/solid/solidDigestRepository";
import { createSolidInstanceCopier } from "@solid-memo/solid/solidInstanceCopier";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { createSolidPaletteRepository } from "@solid-memo/solid/solidPaletteRepository";
import { createSolidPreferencesRepository } from "@solid-memo/solid/solidPreferencesRepository";
import { createSolidRepairRepository } from "@solid-memo/solid/solidRepairRepository";
import { createSolidReviewStateRepository } from "@solid-memo/solid/solidReviewStateRepository";
import { createSolidWebIdDocumentRepository } from "@solid-memo/solid/solidWebIdDocumentRepository";
import { createWriteFence } from "@solid-memo/solid/writeFence";

const SERVERS = inject("solidServers");

/** A page of the app as createAppUseCases wires it, its answers logged. */
function page() {
  const writeFence = createWriteFence(fetch);
  const podFetch = writeFence.fetch;
  const shapeValidator = createShaclShapeValidator({
    fetch: podFetch,
    shapesFetch,
    ...SHAPE_SOURCES,
  });
  const checkWrite = shapeValidator.checkSubjects;
  const deps = {
    fetch: podFetch,
    checkWrite,
    now: () => new Date(),
    randomId: () => crypto.randomUUID(),
  };
  return createUseCases({
    sessionGateway: undefined as never,
    storageGateway: undefined as never,
    deckLibrary: undefined as never,
    webIdDocumentRepository: createSolidWebIdDocumentRepository({ fetch: podFetch }),
    instanceRepository: createSolidInstanceRepository(deps),
    deckRepository: createSolidDeckRepository(deps),
    preferencesRepository: createSolidPreferencesRepository({ fetch: podFetch, checkWrite }),
    paletteRepository: createSolidPaletteRepository({ fetch: podFetch, checkWrite }),
    reviewStateRepository: createSolidReviewStateRepository({ fetch: podFetch, checkWrite }),
    shapeValidator,
    repairRepository: createSolidRepairRepository({ fetch: podFetch }),
    instanceCopier: createSolidInstanceCopier({ fetch: podFetch }),
    writeFence,
    digestRepository: createSolidDigestRepository({ fetch: podFetch, checkWrite }),
    answerLog: createSolidAnswerLog({ fetch: podFetch, checkWrite }),
    ruleset: "e2e-rules",
  });
}

/** A new instance in a pod of its own, as a learner makes one. */
async function seed(server: string): Promise<string> {
  const base = new URL(`palettes-${crypto.randomUUID()}/`, server).href;
  const webId = `${base}profile/card.ttl#me`;
  const typeIndex = `${base}settings/privateTypeIndex.ttl`;
  const put = async (url: string, body: string) => {
    const response = await fetch(url, {
      method: "PUT",
      headers: { "content-type": "text/turtle" },
      body,
    });
    if (!response.ok) throw new Error(`Seeding ${url}: ${response.status}`);
  };
  await put(
    `${base}profile/card.ttl`,
    `<#me> <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${typeIndex}> .`,
  );
  await put(
    typeIndex,
    `<> a <http://www.w3.org/ns/solid/terms#TypeIndex>, <http://www.w3.org/ns/solid/terms#UnlistedDocument> .`,
  );
  const instance = await page().createInstance(
    { webId },
    { containerUrl: `${base}solid-memo/`, name: "Main", registrationTarget: "private" },
  );
  return instance.url;
}

const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";

describe.each(SERVERS)("palettes on $name", ({ url: server }) => {
  it("keeps a palette saved as written, chosen by its address, and the instance conforming", async () => {
    const instanceUrl = await seed(server);
    const saved = await page().savePalette(instanceUrl, {
      url: null,
      title: { sv: "Läsning på kvällen" },
      basedOn: "parchment",
      light: { "--bg": "#f4ecd8", "--text": "#2b2118" },
      dark: { "--text": "#f4ecd8" },
    });
    expect(saved.url).toMatch(new RegExp(`^${instanceUrl}palettes\\.ttl#palette-`));
    expect(await page().listPalettes(instanceUrl)).toEqual([saved]);

    await page().chooseCustomPalette(saved, instanceUrl);
    expect(await page().getPreferences(instanceUrl)).toMatchObject({ palette: saved.url });
    expect(await page().instancePalette(instanceUrl)).toEqual({
      palette: "parchment",
      custom: saved,
    });

    // Edited in place: the colors left out are its base's again.
    const edited = { ...saved, light: { "--bg": "#f0e6cc" } };
    await page().savePalette(instanceUrl, edited);
    expect(await page().listPalettes(instanceUrl)).toEqual([edited]);
    expect((await page().validateInstance(instanceUrl)).conforms).toBe(true);

    // A built-in palette replaces it in the preferences.
    await page().choosePalette("standard", instanceUrl);
    expect(await page().getPreferences(instanceUrl)).toMatchObject({
      palette: `${SM}standardPalette`,
    });
  });

  it("reports colors that break the rules, and paints none of them", async () => {
    const instanceUrl = await seed(server);
    const document = `${instanceUrl}palettes.ttl`;
    const response = await fetch(document, {
      method: "PUT",
      headers: { "content-type": "text/turtle" },
      body: `@prefix sm: <${SM}> .
<#palette-x> a sm:Palette ; <http://purl.org/dc/terms/title> "X"@en ; sm:basedOn sm:standardPalette ;
  sm:lightColors <#palette-x-light> ; sm:darkColors <#palette-x-dark> .
<#palette-x-light> a sm:ColorSet ; sm:textColor "red; background: url(https://evil.example/x)" ;
  sm:backgroundColor "#ffffff" .
<#palette-x-dark> a sm:ColorSet .`,
    });
    expect(response.ok).toBe(true);
    const report = await page().validateInstance(instanceUrl);
    expect(report.conforms).toBe(false);
    expect(report.documents.find((d) => d.url === document)?.subjects.length).toBeGreaterThan(0);
    expect(await page().listPalettes(instanceUrl)).toEqual([
      {
        url: `${document}#palette-x`,
        title: { en: "X" },
        basedOn: "standard",
        light: { "--bg": "#ffffff" },
        dark: {},
      },
    ]);
  });
});
