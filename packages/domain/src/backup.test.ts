import { describe, expect, it } from "vitest";
import {
  backupCopyUrlOf,
  backupFolderOf,
  backupsContainerOf,
  manifestUrlOf,
  restoreActionOf,
  withVersionUpdated,
  type Backup,
} from "./backup";

const MAIN = "https://pod.example/solid-memo/main/";
const FOLDER = `${MAIN}backups/20261009T100000Z-0f3a1b2c/`;

describe("where a backup is kept", () => {
  it("in the instance's backups/ folder, a folder per backup named by its time and an id", () => {
    expect(backupsContainerOf("https://pod.example/solid-memo/main")).toBe(`${MAIN}backups/`);
    expect(backupFolderOf(MAIN, new Date("2026-10-09T10:00:00.123Z"), "0f3a1b2c-9d8e-4f00-8000-000000000000")).toBe(FOLDER);
    expect(manifestUrlOf(FOLDER)).toBe(`${FOLDER}manifest.ttl`);
  });

  it("keeps a document's earlier version at its own path below the folder, or elsewhere/ for one outside the instance", () => {
    expect(backupCopyUrlOf(FOLDER, MAIN, `${MAIN}decks/deck-1.ttl`, 3)).toBe(`${FOLDER}decks/deck-1.ttl`);
    expect(backupCopyUrlOf(FOLDER, MAIN, "https://pod.example/elsewhere/cards.ttl", 3)).toBe(`${FOLDER}elsewhere/3.ttl`);
  });
});

describe("restoreActionOf", () => {
  it("puts back a document still as the update left it, and keeps one changed since", () => {
    const entry = { document: `${MAIN}meta.ttl`, copy: `${FOLDER}meta.ttl`, versionBackedUp: '"a"', versionUpdated: '"b"' };
    expect(restoreActionOf(entry, '"b"')).toBe("restore");
    expect(restoreActionOf(entry, '"c"')).toBe("keep");
    expect(restoreActionOf(entry, null)).toBe("keep");
  });

  it("leaves a document the update never wrote as it is, and keeps it when it changed all the same", () => {
    const entry = { document: `${MAIN}meta.ttl`, copy: `${FOLDER}meta.ttl`, versionBackedUp: '"a"' };
    expect(restoreActionOf(entry, '"a"')).toBe("asItWas");
    expect(restoreActionOf(entry, '"b"')).toBe("keep");
    expect(restoreActionOf({ document: `${MAIN}catalog.ttl` }, null)).toBe("asItWas");
    expect(restoreActionOf({ document: `${MAIN}catalog.ttl` }, '"a"')).toBe("keep");
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
