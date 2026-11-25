// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it } from "vitest";
import type { StoredResource } from "@solid-memo/application/ports/device";
import { GUEST_ORIGIN } from "@solid-memo/domain/guest";
import { DATABASE, DATABASE_VERSION, LOCK, RESOURCES } from "./indexedDbResourceStore";
import { CHANNEL as LOGOUT_CHANNEL, KEY as LOGOUT_KEY } from "./logoutChannel";
import { KEY as LANGUAGE_KEY } from "./localStorageLanguagePreference";
import { KEY as CUSTOM_PALETTE_KEY } from "./localStorageCustomPalettePreference";
import { KEY as SEEN_HIGHLIGHTS_KEY } from "./localStorageSeenHighlights";
import { PALETTE_KEY, TEXT_SIZE_KEY, THEME_KEY } from "./localStorageSetting";
import { PREFIX as JOURNAL_PREFIX } from "./localStorageUpdateJournal";

/**
 * A record of each kind the guest's pod keeps. Typed against
 * StoredResource, so a kind or a field added, renamed or dropped there
 * fails the typecheck until it is noted here too.
 */
const RECORDS: { [K in StoredResource["kind"]]: Extract<StoredResource, { kind: K }> } = {
  container: { kind: "container", etag: "" },
  rdf: { kind: "rdf", etag: "", triples: [] },
  file: { kind: "file", etag: "", contentType: "", bytes: new Uint8Array() },
};

/**
 * What this package keeps in the browser, part of the app's public API
 * (docs/releasing.md#the-public-api): the localStorage keys, the
 * IndexedDB database that holds a guest's pod, its version, store,
 * records and the origin its keys are under, and the Web Locks and the
 * BroadcastChannel the site's tabs share. A line that goes, a key renamed or a database
 * raised, is a breaking change, which `npm run check:breaking` holds to
 * a commit that says so.
 */
it("keeps api/browser-storage/browser.txt to what the browser keeps", async () => {
  const lines = [
    `localStorage: ${LANGUAGE_KEY}`,
    `localStorage: ${PALETTE_KEY}`,
    ...["palette", "light", "dark"].map(
      (field) => `localStorage: ${CUSTOM_PALETTE_KEY}, field ${field}`,
    ),
    `localStorage: ${SEEN_HIGHLIGHTS_KEY}, a JSON array of highlight ids`,
    `localStorage: ${TEXT_SIZE_KEY}`,
    `localStorage: ${THEME_KEY}`,
    `localStorage: ${JOURNAL_PREFIX}<source URL>`,
    `Web Locks: ${JOURNAL_PREFIX}<source URL>`,
    `Web Locks: ${LOCK}`,
    `BroadcastChannel: ${LOGOUT_CHANNEL}`,
    `localStorage: ${LOGOUT_KEY}, set and removed at once, where there is no BroadcastChannel`,
    `indexedDB: ${DATABASE} version ${DATABASE_VERSION}, store ${RESOURCES}, keyed by resource URL under ${GUEST_ORIGIN}`,
    ...Object.values(RECORDS).map(
      (record) =>
        `indexedDB: ${DATABASE} store ${RESOURCES}, record of kind ${record.kind}: ${Object.keys(record).sort().join(", ")}`,
    ),
  ];
  await expect(`${lines.sort().join("\n")}\n`).toMatchFileSnapshot(
    "../../../../api/browser-storage/browser.txt",
  );
});

/**
 * The version of the guest pod's database, which never moves: a tab of
 * an older version cannot open a database a newer one raised. A line
 * that goes fails `npm run check:breaking` whatever a commit says.
 */
it("keeps api/frozen/browser-storage/browser.txt to the database's version", async () => {
  await expect(`indexedDB: ${DATABASE} version ${DATABASE_VERSION}\n`).toMatchFileSnapshot(
    "../../../../api/frozen/browser-storage/browser.txt",
  );
});
