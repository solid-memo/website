// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { buildThing, getThing, setThing } from "./client/rdf";
import { getSolidDatasetOrNull, saveDataset } from "./datasets";
import { createSolidPreferencesRepository } from "./solidPreferencesRepository";
import { fakePod } from "./testing/fakePod";

const INSTANCE = "https://pod.example/memo/";
const TITLE = "http://purl.org/dc/terms/title";
const LABEL = "http://example.org/label";

/**
 * A literal with a base direction (RDF 1.2) that another app wrote into
 * a document of the app's is kept as it was read, and written back so,
 * whatever the app writes beside it or in its place.
 */
describe("a literal with a base direction in a pod document", () => {
  it("is kept by a save of the preferences, which writes the whole document", async () => {
    const doc = `${INSTANCE}preferences.ttl`;
    const pod = fakePod();
    await pod.put(doc, `<#note> <${LABEL}> "مرحبا"@ar--rtl .`);
    await createSolidPreferencesRepository({ fetch: pod.fetch }).savePreferences(
      INSTANCE,
      DEFAULT_PREFERENCES,
    );
    expect(pod.requests.map(({ method }) => method)).toContain("PUT");
    expect(pod.triples(doc)).toContain(`<${doc}#note> <${LABEL}> "مرحبا"@ar--rtl .`);
  });

  it("is kept by an edit beside it, and replaced by an edit of it, each one PATCH", async () => {
    const doc = `${INSTANCE}decks/x.ttl`;
    const pod = fakePod();
    await pod.put(doc, `<#c> <${TITLE}> "a"@en--ltr ; <${LABEL}> "b"@ar--rtl .`);
    const edit = async (property: string, value: string) => {
      const read = (await getSolidDatasetOrNull(doc, pod.fetch))!;
      const thing = buildThing(getThing(read, `${doc}#c`)!)
        .removeAll(property)
        .addStringNoLocale(property, value)
        .build();
      await saveDataset(doc, setThing(read, thing), pod.fetch);
    };
    await edit(TITLE, "new");
    expect(pod.triples(doc)).toEqual([
      `<${doc}#c> <${LABEL}> "b"@ar--rtl .`,
      `<${doc}#c> <${TITLE}> "new" .`,
    ]);
    await edit(LABEL, "plain");
    expect(pod.triples(doc)).toEqual([
      `<${doc}#c> <${LABEL}> "plain" .`,
      `<${doc}#c> <${TITLE}> "new" .`,
    ]);
    expect(
      pod.requests.filter(({ method }) => method !== "GET").map(({ method }) => method),
    ).toEqual(["PATCH", "PATCH"]);
  });
});
