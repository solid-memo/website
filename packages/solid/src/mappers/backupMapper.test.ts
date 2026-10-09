import { buildThing, createSolidDataset, createThing, setThing } from "@inrupt/solid-client";
import { describe, expect, it } from "vitest";
import type { Backup } from "@solid-memo/domain/backup";
import { RDF, SM } from "../vocab";
import { entryUrlOf, manifestOf, toBackup, withVersionUpdated } from "./backupMapper";

const FOLDER = "https://pod.example/solid-memo/main/backups/20261009T100000Z-0f3a1b2c/";
const backup: Backup = {
  url: FOLDER,
  of: "https://pod.example/solid-memo/main/",
  createdAt: "2026-10-09T10:00:00.000Z",
  entries: Array.from({ length: 11 }, (_, i) => ({ document: `https://pod.example/solid-memo/main/d${i}.ttl` })),
};

describe("a backup's manifest", () => {
  it("is read back as written, its entries in order (the tenth after the ninth)", () => {
    const { dataset, subjects } = manifestOf(createSolidDataset(), backup);
    expect(subjects[0]).toBe(`${FOLDER}manifest.ttl#it`);
    expect(subjects.at(-1)).toBe(entryUrlOf(FOLDER, 11));
    expect(toBackup(dataset, FOLDER)).toEqual(backup);
    // A library upgrade's backup names the release the deck was at.
    const upgrade = { ...backup, of: `${backup.of}catalog.ttl#deck-1`, release: "https://solid-memo.com/decks/capitals/v1.ttl" };
    expect(toBackup(manifestOf(createSolidDataset(), upgrade).dataset, FOLDER)).toEqual(upgrade);
  });

  it("holds no backup without its #it, or one that does not fit; a subject of no entry's name is no entry", () => {
    expect(toBackup(createSolidDataset(), FOLDER)).toBeNull();
    const untyped = setThing(createSolidDataset(), buildThing(createThing({ url: `${FOLDER}manifest.ttl#it` })).build());
    expect(toBackup(untyped, FOLDER)).toBeNull();
    const { dataset } = manifestOf(createSolidDataset(), { ...backup, entries: [] });
    const stray = buildThing(createThing({ url: `${FOLDER}manifest.ttl#other` }))
      .addIri(RDF.type, SM.BackupEntry)
      .addIri(SM.backedUpDocument, "https://pod.example/x.ttl")
      .build();
    expect(toBackup(setThing(dataset, stray), FOLDER)!.entries).toEqual([]);
  });

  it("notes the version an update left a document at on its entry alone", () => {
    const { dataset } = manifestOf(createSolidDataset(), backup);
    const noted = withVersionUpdated(dataset, backup.entries[3]!.document, '"v2"')!;
    expect(noted.subject).toBe(entryUrlOf(FOLDER, 4));
    expect(toBackup(noted.dataset, FOLDER)!.entries[3]).toEqual({ ...backup.entries[3], versionUpdated: '"v2"' });
    expect(withVersionUpdated(dataset, "https://pod.example/elsewhere.ttl", '"v2"')).toBeNull();
  });
});
