// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { describe, expect, it } from "vitest";
import { datasetFromQuads } from "./client/rdf";
import { MAX_TERM_CHARACTERS } from "./client/readLimits";
import { getSolidDatasetLinear, parseQuads, solidDatasetAsTurtle } from "./client/resources";
import { parseDeckFile } from "./solidDeckArchive";
import { createSolidPaletteRepository } from "./solidPaletteRepository";
import { createSolidPreferencesRepository } from "./solidPreferencesRepository";
import { SM_NS } from "./vocab";
import { refuseUnwritable } from "./writableTerms";

const INSTANCE = "https://pod.example/solid-memo/a/";
const PREFERENCES = `${INSTANCE}preferences.ttl`;
const PALETTES = `${INSTANCE}palettes.ttl`;
const OTHER = "https://other.example/p";

/** Another app's statement on the app's own preferences, its object a blank node labelled `length` characters long. */
const foreign = (length: number) =>
  `<${PREFERENCES}#it> <${OTHER}> _:b${"x".repeat(length - 1)} .\n`;

const preferencesOf = (extra: string) => `@prefix sm: <${SM_NS}> .
<${PREFERENCES}#it> a sm:Preferences ; sm:formatVersion 6 ; sm:newCardsPerDay 5 ;
  sm:maxReviewsPerDay 200 ; sm:dayBoundaryHour 4 ; sm:answerScale "sm2" ;
  sm:developerMode false ; sm:invalidDataPolicy sm:warnOnly ; sm:theme sm:systemTheme ;
  sm:studyScheduler sm:sm2 ; sm:desiredRetention 0.9 ; sm:schedulerInvitationDismissed false ;
  sm:palette sm:standardPalette ; sm:textSize sm:defaultTextSize .
${extra}`;

/**
 * A pod that keeps each document as the Turtle text last put, as a server
 * that stores what it is sent does, and counts the writes it takes.
 */
function textPod(documents: Record<string, string>) {
  let writes = 0;
  let version = 0;
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "PUT") {
      writes++;
      documents[url] = String(init?.body);
    }
    const text = documents[url];
    const response =
      method !== "GET" && method !== "HEAD"
        ? new Response(null, { status: 205, headers: { ETag: `"v${++version}"` } })
        : text === undefined
          ? new Response("not found", { status: 404 })
          : new Response(method === "HEAD" ? null : text, {
              headers: { "Content-Type": "text/turtle", ETag: `"v${version}"` },
            });
    Object.defineProperty(response, "url", { value: url });
    return response;
  }) as typeof globalThis.fetch;
  return { fetch, documents, writes: () => writes };
}

/** The lengths from `first` to `last`, both included. */
const lengthsFrom = (first: number, last: number) =>
  Array.from({ length: last - first + 1 }, (_, at) => first + at);

/** "ok", or the code (or name) of the error the promise rejects with. */
const outcome = (promise: Promise<unknown>) =>
  promise.then(
    () => "ok",
    (error: { code?: string; name: string }) => error.code ?? error.name,
  );

/** The read and whole-document saves of the preferences and palettes, the statement in both, and a read after. */
async function readAndSave(length: number) {
  const pod = textPod({
    [PREFERENCES]: preferencesOf(foreign(length)),
    [PALETTES]: foreign(length),
  });
  const preferences = createSolidPreferencesRepository({ fetch: pod.fetch });
  const palettes = createSolidPaletteRepository({ fetch: pod.fetch });
  const read = await outcome(preferences.getPreferences(INSTANCE));
  const saves = [
    await outcome(preferences.savePreferences(INSTANCE, { ...DEFAULT_PREFERENCES, theme: "dark" })),
    await outcome(preferences.markConnectedScreen(INSTANCE, true, null)),
    await outcome(
      palettes.savePalette(INSTANCE, {
        url: `${PALETTES}#palette-1`,
        title: { en: "Mine" },
        basedOn: "standard",
        light: {},
        dark: {},
      }),
    ),
    // Read again, as the app wrote it.
    await outcome(preferences.getPreferences(INSTANCE)),
  ];
  return { read, saves, writes: pod.writes() };
}

describe("a blank node label near the bound on a term", () => {
  // The parser puts a prefix of its own before each label it reads (`b0_`, `b12_`), longer as more
  // documents are read, so the exact edge moves by a character or two: the lengths span it, and the
  // window a read took in but a write refused (from 32 characters short of the bound).
  const lengths = Array.from({ length: 50 }, (_, at) => MAX_TERM_CHARACTERS - 45 + at);

  it("is refused on read or saved whole: a label a read keeps never blocks a save", async () => {
    const kept: number[] = [];
    const refused: number[] = [];
    for (const length of lengths) {
      const { read, saves, writes } = await readAndSave(length);
      if (read === "ok") {
        expect(saves, `label of ${length}`).toEqual(["ok", "ok", "ok", "ok"]);
        expect(writes).toBe(3);
        kept.push(length);
      } else {
        // Refused as any document with a term too long is, the palettes too; nothing is written.
        expect([read, ...saves], `label of ${length}`).toEqual(Array(5).fill("ReadLimitError"));
        expect(writes).toBe(0);
        refused.push(length);
      }
    }
    // Both sides of the edge, one after the other: up to it a label is kept, past it refused.
    expect(Math.max(...kept)).toBeLessThan(Math.min(...refused));
    // The window a read took in but a write refused is read and saved now: a Turtle read names the blank
    // node anew, short, so the label it was read with is never written back.
    expect(kept).toContain(MAX_TERM_CHARACTERS - 30);
    expect(kept).toContain(MAX_TERM_CHARACTERS - 10);
    expect(refused).toContain(MAX_TERM_CHARACTERS);
  });

  it("in a JSON-LD file is refused at import, or imported, written and read back", async () => {
    // A JSON-LD read keeps its labels and writes them back as they are, so it holds one to the bound as
    // a write does: with room for the prefix a later Turtle read puts before it.
    const base = "https://pod.example/decks/deck.ttl";
    const file = (length: number) =>
      JSON.stringify({ "@id": `${base}#a`, [OTHER]: { "@id": `_:${"x".repeat(length)}` } });
    const imported: number[] = [];
    const refused: number[] = [];
    for (let length = MAX_TERM_CHARACTERS - 40; length <= MAX_TERM_CHARACTERS - 28; length++) {
      const quads = await parseDeckFile(file(length), "jsonld", base, null).catch(
        (error: { code: string }) => error.code,
      );
      if (typeof quads === "string") {
        expect(quads, `label of ${length}`).toBe("deckFileUnreadable");
        refused.push(length);
        continue;
      }
      refuseUnwritable(quads);
      const written = await solidDatasetAsTurtle(datasetFromQuads(quads));
      await expect(parseQuads(written, "turtle", base), `label of ${length}`).resolves.toHaveLength(
        1,
      );
      const fetch = textPod({ [base]: written }).fetch;
      await expect(
        getSolidDatasetLinear(base, { fetch }),
        `label of ${length}`,
      ).resolves.toBeDefined();
      imported.push(length);
    }
    expect(imported).toContain(MAX_TERM_CHARACTERS - 34);
    expect(refused).toEqual(lengthsFrom(MAX_TERM_CHARACTERS - 33, MAX_TERM_CHARACTERS - 28));
  });

  it("is written back short, however often the document is saved", async () => {
    const pod = textPod({ [PREFERENCES]: preferencesOf(foreign(MAX_TERM_CHARACTERS - 50)) });
    const preferences = createSolidPreferencesRepository({ fetch: pod.fetch });
    for (const theme of ["dark", "light", "dark", "light"] as const) {
      await preferences.savePreferences(INSTANCE, { ...DEFAULT_PREFERENCES, theme });
      // A read names the blank node anew, so no parser's prefix is kept to grow with each save.
      expect(pod.documents[PREFERENCES]).toMatch(new RegExp(`<${OTHER}> _:[\\w.-]{1,40}[;.]`));
    }
    expect(pod.writes()).toBe(4);
    await expect(preferences.getPreferences(INSTANCE)).resolves.not.toBeNull();
  });
});
