// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/*
 * The driven ports of what the app keeps where it runs, the browser: the language and the settings, the screens' values, the update journal, word of a logout, the guest's pod's store, and files on the user's device. The browser adapters implement them.
 */

import type { Locale } from "@solid-memo/domain/locale";
import type { CustomPalette } from "@solid-memo/domain/customPalette";

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
 * Driven port: the language the user chose for the app, kept where the
 * app runs (the browser), since it is needed before any pod is reached.
 * Best effort: it may forget, and the app then speaks the browser's
 * language.
 */
export interface LanguagePreference {
  /** The chosen language; null when none was chosen (or it was forgotten). */
  chosen(): Locale | null;
  choose(locale: Locale): void;
}

/**
 * Driven port: a choice of how the app is shown (a SettingKind of
 * domain: the theme, the palette, the text size), kept where the app
 * runs (the browser), since it is needed before any pod is reached: on
 * the sign-in screens, and for the first paint. An instance's
 * preferences, once it has them, keep the choice too and win. Best
 * effort: it may forget, and the setting is then its fallback (the
 * browser's theme, the standard colors, the browser's own text size).
 */
export interface DeviceSetting<T> {
  /** The chosen value; the setting's fallback when none was chosen (or it was forgotten). */
  chosen(): T;
  choose(value: T): void;
}

/**
 * Driven port: a copy of the user's own palette being shown, kept where
 * the app runs (the browser), so that the first paint has its colors
 * before any pod is reached. Best effort: it may forget, and the app is
 * then in the palette's base until the instance is read.
 */
export interface CustomPalettePreference {
  /**
   * The palette kept, without its name (an empty title: only what the
   * first paint needs is kept); null when none is (a built-in palette is
   * shown, or it was forgotten).
   */
  chosen(): CustomPalette | null;
  /** Keep this palette, or none. */
  choose(palette: CustomPalette | null): void;
}

/**
 * Driven port: the ids of the highlights of new versions ("New in this
 * version") this browser has shown, or spared a first visit, kept where
 * the app runs (the browser), since they are no one's data but the
 * device's. Best effort: it may forget, and the app then takes the next
 * visit for a first one and shows nothing; where it cannot keep them
 * (storage full), a closed card comes back on the next visit.
 */
export interface SeenHighlights {
  /** The ids kept; null when none are (a first visit, or they were forgotten). */
  seen(): string[] | null;
  see(ids: readonly string[]): void;
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
   * other code reads as it is, such as a WebID.
   */
  text?: boolean;
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
