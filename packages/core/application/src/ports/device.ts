// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/*
 * The driven ports of what the app keeps where it runs, the browser: the values the use cases and the screens keep, the update journal, word of a logout, the guest's pod's store, and files on the user's device. The browser adapters implement them.
 */

/**
 * Driven port: files on the user's device, which the user picks. Text
 * only.
 */
export interface FileExchange {
  /** Hand the text to the browser to save, as a download named `name`. */
  save(name: string, mediaType: string, text: string): void;
  /** The file the user picks, of those `accept` names (as an input's accept attribute); null when they pick none. */
  open(accept: string): Promise<{ name: string; text: string } | null>;
}

/**
 * Driven port: a note of an update in progress, kept where the app runs
 * (the browser), so an update cut off half-way (a closed tab) can be
 * found: a guest's study being moved into its new folder, or each
 * guest's deck already added to an instance (domain/guest.ts
 * GuestMergeNote). Best effort: it may forget, and keeps no entry
 * longer than a bound it sets.
 */
export interface UpdateJournal {
  begin(sourceUrl: string, stagingUrl: string): void;
  end(sourceUrl: string): void;
  /** The source of each entry the journal keeps; none when it cannot be read. */
  sources(): string[];
  /** What an unfinished update of the source was writing; null when none. */
  staging(sourceUrl: string): string | null;
  /**
   * Mark this page as running a move of the guest's instance until the
   * returned function is called, or the page goes away. An entry outlives
   * its run when the move fails half-way: only the mark tells other pages
   * the move still runs.
   */
  run(sourceUrl: string): () => void;
  /**
   * Call `changed` for each move another page of the app, in this
   * browser, runs: at once for those running already, then as each begins
   * (`staging` its copy); with `staging` null once it stops running or its
   * entry ends. Never for this page's own. It watches for as long as the
   * page lives.
   */
  watch(changed: (sourceUrl: string, staging: string | null) => void): void;
}

/**
 * What a value kept on the device is: how it is read back from what is
 * stored (`decode`, given what the stored JSON holds), and what it is
 * when nothing that fits is kept (`fallback`). The fallback is kept as
 * nothing at all.
 */
export interface ValueKind<T> {
  /** What is stored, read as the value; the fallback for what does not fit. */
  decode(stored: unknown): T;
  fallback: T;
}

/** What a value kept on the device under a key of its own is (DeviceStore `value`). */
export interface DeviceValueKind<T> extends ValueKind<T> {
  /**
   * Kept as its text, not as JSON, and decoded from the text: for a value
   * other code reads as it is, such as a WebID, or the theme the script
   * in index.html sets before the first paint.
   */
  text?: boolean;
  /**
   * What is kept as JSON of a value: only part of it, or another form.
   * The value as it is when none is given. Never given the fallback,
   * which is kept as no value at all.
   */
  encode?(value: T): unknown;
  /**
   * The most characters the value takes, its key and its text together,
   * when that is fewer than the store keeps of any value. A longer one is
   * not kept, and one kept before is read as none.
   */
  maxCharacters?: number;
}

/** A value kept on the device (DeviceStore). Best effort: it may forget, and is then its kind's fallback. */
export interface DeviceValue<T> {
  read(): T;
  write(value: T): void;
}

/**
 * A value kept on the device for each instance, under one key
 * (DeviceStore `byInstance`). Best effort, as a DeviceValue is.
 */
export interface InstanceDeviceValues<T> {
  read(instanceUrl: string): T;
  write(instanceUrl: string, value: T): void;
}

/** What a value kept for each instance is: a ValueKind, and where it was kept before it was kept by instance. */
export interface InstanceValueKind<T> extends ValueKind<T> {
  /**
   * The prefix of the keys the value was kept under before, one key an
   * instance, the instance's URL after it: read once, kept by instance,
   * and removed.
   */
  legacyPrefix?: string;
}

/*
 * The keys of the choices the use cases keep on this device
 * (deviceChoices), part of what the device store is given to keep. The theme,
 * the palette, the text size and the custom palette's colors are also
 * read by the script in index.html that sets them before the first paint,
 * so each is kept as that script reads it.
 */
/** The language the user chose. */
export const LANGUAGE_KEY = "solid-memo:language";
/** The theme (THEME_SETTING). */
export const THEME_KEY = "solid-memo:theme";
/** The palette (PALETTE_SETTING). */
export const PALETTE_KEY = "solid-memo:palette";
/** The text size (TEXT_SIZE_SETTING). */
export const TEXT_SIZE_KEY = "solid-memo:textSize";
/** A copy of the user's own palette being shown (deviceChoices). */
export const CUSTOM_PALETTE_KEY = "solid-memo:palette-colors";
/** The ids of the highlights seen, as a JSON array. */
export const SEEN_HIGHLIGHTS_KEY = "solid-memo:seenHighlights";

/**
 * Driven port: values kept where the app runs (the browser), such as how
 * the deck list is folded, the languages chosen lately or the Studio's
 * layout, which are this device's and no one's data. Each value is read
 * and written as its kind says; the store holds what is the same for
 * every value: storage that is missing or refuses, what it holds that is
 * not JSON, and how much it keeps, so no value fills the browser's
 * storage and leaves no room for the rest. Best effort: it may forget.
 */
export interface DeviceStore {
  value<T>(key: string, kind: DeviceValueKind<T>): DeviceValue<T>;
  /**
   * A value for each instance, under one key: those of the instances
   * written last are kept, as many as fit, and the others let go.
   */
  byInstance<T>(key: string, kind: InstanceValueKind<T>): InstanceDeviceValues<T>;
}

/**
 * Driven port: word of a logout to this browser's other pages of the
 * app, each of which holds its session in its own memory. Best effort:
 * a browser with no way to tell them leaves them to their token's end.
 */
export interface LogoutChannel {
  /** Tell the other pages the user logged out; never this page. */
  announce(): void;
  /** Call `listener` for each logout another page announces. Returns an unsubscribe function. */
  listen(listener: () => void): () => void;
}

/**
 * A resource of the pod kept in the browser for guests (docs/guest-mode.md):
 * a container, an RDF document (its triples as N-Triples lines, IRIs
 * absolute) or any other file. Every write gives it a new `etag`.
 */
export type StoredResource =
  | { kind: "container"; etag: string }
  | { kind: "rdf"; etag: string; triples: string[] }
  | { kind: "file"; etag: string; contentType: string; bytes: Uint8Array };

/**
 * Driven port: where the guest's pod keeps its resources, by URL, on this
 * device. Implemented over IndexedDB in the browser, in memory in tests.
 */
export interface ResourceStore {
  get(url: string): Promise<StoredResource | undefined>;
  set(url: string, resource: StoredResource): Promise<void>;
  delete(url: string): Promise<void>;
  /** The URL of every resource kept, in no particular order. */
  urls(): Promise<string[]>;
  /** Forget every resource. */
  clear(): Promise<void>;
  /**
   * Run `work` while no other exclusive work runs on the same store, in
   * this tab or another, so a read-check-write is never interleaved.
   */
  exclusive<T>(work: () => Promise<T>): Promise<T>;
}
