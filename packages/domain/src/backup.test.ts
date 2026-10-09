import { describe, expect, it } from "vitest";
import {
  ABANDONED_RUN_MS,
  backupCopyUrlOf,
  backupFolderOf,
  backupsContainerOf,
  deckAt,
  decodeRunNote,
  encodeRunNote,
  instanceOfBackup,
  isAsWritten,
  isPlainUrl,
  isRunOver,
  manifestUrlOf,
  restoreActionOf,
  stagedUrlOf,
  stagingFolderOf,
  stagingMapOf,
  withPicturesAt,
  withVersionUpdated,
  type Backup,
  type RunNote,
} from "./backup";
import type { Deck } from "./deck";

const MAIN = "https://pod.example/solid-memo/main/";
const FOLDER = `${MAIN}backups/20261009T100000Z-0f3a1b2c/`;
const STAGING = `${FOLDER}staging/`;
const OUTSIDE = "https://pod.example/elsewhere/cards.ttl";

describe("where a backup is kept", () => {
  it("in the instance's backups/ folder, a folder per backup named by its time and an id", () => {
    expect(backupsContainerOf("https://pod.example/solid-memo/main")).toBe(`${MAIN}backups/`);
    expect(backupFolderOf(MAIN, new Date("2026-10-09T10:00:00.123Z"), "0f3a1b2c-9d8e-4f00-8000-000000000000")).toBe(FOLDER);
    expect(manifestUrlOf(FOLDER)).toBe(`${FOLDER}manifest.ttl`);
    expect(instanceOfBackup(FOLDER)).toBe(MAIN);
    // Spelled as the folder is, whatever a URL parser would make of it.
    expect(instanceOfBackup("https://pod.example/my%20memo/backups/x/")).toBe("https://pod.example/my%20memo/");
  });

  it("keeps a document's bytes at its own path below the folder, .orig added, or elsewhere/ for one outside the instance", () => {
    expect(backupCopyUrlOf(FOLDER, MAIN, `${MAIN}decks/deck-1.ttl`, 3)).toBe(`${FOLDER}decks/deck-1.ttl.orig`);
    expect(backupCopyUrlOf(FOLDER, "https://pod.example/solid-memo/main", OUTSIDE, 3)).toBe(`${FOLDER}elsewhere/3.orig`);
    // A path the folder uses itself: never inside the working copy, deleted whole, nor at another's numbered file.
    expect(backupCopyUrlOf(FOLDER, MAIN, `${MAIN}staging/decks/deck-1.ttl`, 3)).toBe(`${FOLDER}elsewhere/3.orig`);
    expect(backupCopyUrlOf(FOLDER, MAIN, `${MAIN}elsewhere/1`, 4)).toBe(`${FOLDER}elsewhere/4.orig`);
    expect(backupCopyUrlOf(FOLDER, MAIN, `${MAIN}staging.ttl`, 3)).toBe(`${FOLDER}staging.ttl.orig`);
  });

  it("is as an update writes one only when every URL is plain and every file where the update keeps its document's bytes", () => {
    const backup: Backup = {
      url: FOLDER,
      of: MAIN,
      createdAt: "2026-10-09T10:00:00.000Z",
      entries: [
        { document: `${MAIN}meta.ttl`, copy: `${FOLDER}meta.ttl.orig` },
        { document: `${MAIN}catalog.ttl` },
        { document: OUTSIDE, copy: `${FOLDER}elsewhere/3.orig` },
      ],
    };
    expect(isAsWritten(backup)).toBe(true);
    const planted = [
      // A request resolves dot segments, in any spelling: these step out of the folder, or the instance.
      { document: `${MAIN}meta.ttl`, copy: `${FOLDER}../../decks/deck-1.ttl` },
      { document: `${MAIN}../profile/card`, copy: `${FOLDER}../profile/card.orig` },
      { document: `${MAIN}%2E%2e/profile/card` },
      { document: `${MAIN}decks/./deck-1.ttl` },
      { document: `${MAIN}decks\\..\\..\\profile\\card` },
      { document: `${MAIN}meta.ttl?x` },
      { document: `${MAIN}meta.ttl#it` },
      // A file other than the one the update keeps its document's bytes in.
      { document: `${MAIN}meta.ttl`, copy: `${FOLDER}catalog.ttl.orig` },
      { document: OUTSIDE, copy: `${FOLDER}elsewhere/1.orig` },
    ];
    for (const entry of planted) {
      expect(isAsWritten({ ...backup, entries: [backup.entries[0]!, backup.entries[1]!, entry] }), JSON.stringify(entry)).toBe(false);
    }
    expect(isAsWritten({ ...backup, url: `${MAIN}backups/../decks/` })).toBe(false);
    // Plain: a dot inside a segment, percent-encoding that names no dot segment, and a space, which a request encodes.
    expect(isPlainUrl(`${MAIN}decks/.deck-1.ttl`)).toBe(true);
    expect(isPlainUrl(`${MAIN}my%20decks/...ttl`)).toBe(true);
    expect(isPlainUrl(`${MAIN}my decks/x.ttl`)).toBe(true);
    // Not: a tab, which a request drops, making ".\t." a "..".
    expect(isPlainUrl(`${MAIN}.\t./profile/card`)).toBe(false);
  });

  it("writes the update's working copy in staging/, each document at its own path, one outside the instance at elsewhere/", () => {
    expect(stagingFolderOf(FOLDER)).toBe(STAGING);
    expect(stagedUrlOf(FOLDER, MAIN, `${MAIN}decks/deck-1.ttl`, 3)).toBe(`${STAGING}decks/deck-1.ttl`);
    expect(stagedUrlOf(FOLDER, MAIN, OUTSIDE, 3)).toBe(`${STAGING}elsewhere/3.ttl`);
  });
});

describe("stagingMapOf", () => {
  const backup: Backup = {
    url: FOLDER,
    of: MAIN,
    createdAt: "2026-10-09T10:00:00.000Z",
    entries: [{ document: `${MAIN}catalog.ttl` }, { document: OUTSIDE }],
  };
  const map = stagingMapOf(backup);

  it("moves every IRI of the instance into the staging folder, and back", () => {
    for (const [iri, staged] of [
      [`${MAIN}catalog.ttl#deck-1`, `${STAGING}catalog.ttl#deck-1`],
      [`${MAIN}decks/deck-1.ttl`, `${STAGING}decks/deck-1.ttl`],
      // A document the backup does not hold, and a picture: the copy's documents stand to them as the instance's do.
      [`${MAIN}decks/deck-1-0f3a.ttl#se`, `${STAGING}decks/deck-1-0f3a.ttl#se`],
      [`${MAIN}attachments/a.png`, `${STAGING}attachments/a.png`],
    ]) {
      expect(map.toStaged(iri!)).toBe(staged);
      expect(map.toOriginal(staged!)).toBe(iri);
    }
  });

  it("moves a document of the backup outside the instance, and its fragments, to its own place; anything else stays", () => {
    expect(map.toStaged(OUTSIDE)).toBe(`${STAGING}elsewhere/2.ttl`);
    expect(map.toStaged(`${OUTSIDE}#se`)).toBe(`${STAGING}elsewhere/2.ttl#se`);
    expect(map.toOriginal(`${STAGING}elsewhere/2.ttl#se`)).toBe(`${OUTSIDE}#se`);
    for (const iri of ["https://alice.example/profile/card#me", "https://pod.example/elsewhere/cards.ttl.bak", "https://pod.example/elsewhere/other.ttl"]) {
      expect(map.toStaged(iri)).toBe(iri);
      expect(map.toOriginal(iri)).toBe(iri);
    }
  });

  it("finds a deck, and its cards' pictures, where a map puts them", () => {
    const deck = {
      url: `${MAIN}catalog.ttl#deck-1`,
      cardsDocumentUrl: `${MAIN}decks/deck-1.ttl`,
      reviewsDocumentUrl: `${MAIN}reviews/deck-1.ttl`,
      id: "deck-1",
    } as Deck;
    expect(deckAt(deck, map.toStaged)).toEqual({
      ...deck,
      url: `${STAGING}catalog.ttl#deck-1`,
      cardsDocumentUrl: `${STAGING}decks/deck-1.ttl`,
      reviewsDocumentUrl: `${STAGING}reviews/deck-1.ttl`,
    });
    const card = { front: { en: "a" }, back: { en: "b" } };
    expect(withPicturesAt([card, { ...card, frontImageUrl: `${STAGING}a.png`, backImageUrl: "https://example.org/b.png" }], map.toOriginal)).toEqual([
      card,
      { ...card, frontImageUrl: `${MAIN}a.png`, backImageUrl: "https://example.org/b.png" },
    ]);
  });
});

describe("restoreActionOf", () => {
  const entry = { document: `${MAIN}meta.ttl`, copy: `${FOLDER}meta.ttl.orig`, versionBackedUp: '"a"', versionUpdated: '"b"' };
  const state = (version: string | null, asBackedUp = false) => ({ version, asBackedUp });

  it("leaves a document as backed up as it is, whatever its version says", () => {
    expect(restoreActionOf(entry, state('"a"', true))).toBe("asItWas");
    expect(restoreActionOf(entry, state('"b"', true))).toBe("asItWas");
    expect(restoreActionOf({ document: `${MAIN}catalog.ttl` }, state(null, true))).toBe("asItWas");
  });

  it("puts back a document still at the version the update left it at, noted in the manifest or else by the browser", () => {
    expect(restoreActionOf(entry, state('"b"'))).toBe("restore");
    const unnoted = { ...entry, versionUpdated: undefined };
    expect(restoreActionOf(unnoted, state('"b"'))).toBe("compare");
    expect(restoreActionOf(unnoted, state('"b"'), '"b"')).toBe("restore");
  });

  it("compares any other with the update's working copy, and keeps one gone since", () => {
    expect(restoreActionOf(entry, state('"c"'))).toBe("compare");
    expect(restoreActionOf({ document: `${MAIN}catalog.ttl` }, state('"x"'))).toBe("compare");
    expect(restoreActionOf(entry, state(null))).toBe("keep");
  });
});

describe("withVersionUpdated", () => {
  it("notes the version on the document's entry alone", () => {
    const backup: Backup = {
      url: FOLDER,
      of: MAIN,
      createdAt: "2026-10-09T10:00:00.000Z",
      entries: [{ document: `${MAIN}meta.ttl` }, { document: `${MAIN}catalog.ttl` }],
    };
    expect(withVersionUpdated(backup, `${MAIN}catalog.ttl`, '"b"').entries).toEqual([
      { document: `${MAIN}meta.ttl` },
      { document: `${MAIN}catalog.ttl`, versionUpdated: '"b"' },
    ]);
  });
});

describe("the browser's note of an update under way", () => {
  const note: RunNote = { folder: FOLDER, startedAt: "2026-10-09T10:00:00.000Z", state: "running", updated: { [`${MAIN}meta.ttl`]: '"b"' } };

  it("reads back as written, and is no note when it is not one", () => {
    expect(decodeRunNote(encodeRunNote(note))).toEqual(note);
    expect(decodeRunNote(null)).toBeNull();
    // An earlier version's note: the folder of its copy, or what an earlier upgrade moved.
    expect(decodeRunNote("https://pod.example/solid-memo/main-0f3a/")).toBeNull();
    expect(decodeRunNote(JSON.stringify({ startedAt: note.startedAt, cards: { from: "a", to: "b" } }))).toBeNull();
    for (const broken of ["null", "3", JSON.stringify({ ...note, folder: 1 }), JSON.stringify({ ...note, state: "lost" }), JSON.stringify({ ...note, updated: null })]) {
      expect(decodeRunNote(broken), broken).toBeNull();
    }
    expect(decodeRunNote(JSON.stringify({ ...note, updated: { a: '"x"', b: 2 } }))!.updated).toEqual({ a: '"x"' });
  });

  it("is over once the update ended, or ran long enough to have been cut off", () => {
    const at = (ms: number) => new Date(Date.parse(note.startedAt) + ms);
    expect(isRunOver(note, at(ABANDONED_RUN_MS - 1000))).toBe(false);
    expect(isRunOver(note, at(ABANDONED_RUN_MS))).toBe(true);
    expect(isRunOver({ ...note, state: "stopped" }, at(0))).toBe(true);
    expect(isRunOver({ ...note, state: "done" }, at(0))).toBe(true);
    expect(isRunOver({ ...note, startedAt: "soon" }, at(0))).toBe(true);
  });
});
