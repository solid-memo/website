// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type {
  DeviceStore,
  InstanceDeviceValues,
  InstanceValueKind,
  ValueKind,
} from "@solid-memo/application/ports/device";
import { HASHED_CHARACTERS } from "@solid-memo/domain/pathKeys";

/**
 * The most characters a value kept under a key of its own takes, its
 * key and its text together: far below what the browser lets a site
 * keep. A longer one is not kept, and one kept before is read as none.
 */
export const MAX_VALUE_CHARACTERS = 65_536;

/** How many instances a value kept for each instance is kept for, those written last first. */
export const KEPT_INSTANCES = 20;

/**
 * The most characters a value kept for each instance takes, every
 * instance's together: far below what the browser lets a site keep, so
 * it never fills that and leaves no room for the rest. Instances are let
 * go, those written longest ago first, until what is left fits.
 */
export const MAX_INSTANCES_CHARACTERS = 256 * 1024;

/**
 * The longest instance URL a value is kept for: the bound on a term the
 * app reads (HASHED_CHARACTERS). A longer URL names nothing the app
 * could have read.
 */
const MAX_INSTANCE_URL = HASHED_CHARACTERS;

/**
 * A DeviceStore in the browser's Web Storage: `localStorage` for what
 * the device keeps, or `sessionStorage` for what a tab keeps. Storage may
 * be missing or refuse (a private window, blocked site data, a full
 * quota), so every access is guarded: a value then reads as its
 * fallback, and a write is dropped. A value is kept as JSON (of what its
 * kind encodes, when it encodes), unless its kind keeps its text; its
 * fallback is kept as no value at all. A value takes at most
 * MAX_VALUE_CHARACTERS, or fewer when its kind says so.
 */
export function createWebStorageDeviceStore(
  storage: () => Storage = () => globalThis.localStorage,
): DeviceStore {
  /** The keys whose values kept one key an instance before were moved under them, by this store. */
  const moved = new Set<string>();

  const get = (key: string): string | null => {
    try {
      return storage().getItem(key);
    } catch {
      return null;
    }
  };
  const set = (key: string, text: string | null): void => {
    try {
      if (text === null) storage().removeItem(key);
      else storage().setItem(key, text);
    } catch {
      // Without storage the value lasts until the page is left; nothing else depends on it.
    }
  };
  const keysFrom = (prefix: string): string[] => {
    try {
      const store = storage();
      return Array.from({ length: store.length }, (_, index) => store.key(index)!).filter((key) =>
        key.startsWith(prefix),
      );
    } catch {
      return [];
    }
  };

  return {
    value(key, kind) {
      const limit = Math.min(kind.maxCharacters ?? MAX_VALUE_CHARACTERS, MAX_VALUE_CHARACTERS);
      return {
        read() {
          const text = get(key);
          if (text === null || key.length + text.length > limit) return kind.fallback;
          return kind.text === true ? kind.decode(text) : decoded(text, kind);
        },
        write(value) {
          const text = isFallback(value, kind)
            ? null
            : kind.text === true
              ? String(value)
              : JSON.stringify(kind.encode === undefined ? value : kind.encode(value));
          set(key, text !== null && key.length + text.length > limit ? null : text);
        },
      };
    },

    byInstance<T>(key: string, kind: InstanceValueKind<T>): InstanceDeviceValues<T> {
      /**
       * Every instance's, as stored and read as `kind` reads it: none of
       * an instance whose URL is longer than the store keeps, or whose
       * value is the fallback, nor more than fit (kept). Values kept one
       * key an instance before are moved in after them, once. When the
       * storage holds more than that, what is read is written back in
       * its place, so what is not kept leaves the storage at once.
       */
      function instances(): Map<string, T> {
        const raw = get(key) ?? "{}";
        const stored = decoded(raw, { decode: (value) => value, fallback: null });
        const entries =
          typeof stored === "object" && stored !== null && !Array.isArray(stored)
            ? Object.entries(stored)
            : [];
        const legacy =
          kind.legacyPrefix !== undefined && !moved.has(key) ? kind.legacyPrefix : null;
        moved.add(key);
        const before = legacy === null ? [] : keysFrom(legacy);
        const kept = keptOf(
          [
            ...entries.map(([instanceUrl, value]) => [instanceUrl, kind.decode(value)] as const),
            ...before.map(
              (legacyKey) =>
                [legacyKey.slice(legacy!.length), decoded(String(get(legacyKey)), kind)] as const,
            ),
          ].filter(
            ([instanceUrl, value]) =>
              instanceUrl.length <= MAX_INSTANCE_URL && !isFallback(value, kind),
          ),
        );
        const cleaned = JSON.stringify(Object.fromEntries(kept));
        if (cleaned !== raw) set(key, cleaned === "{}" ? null : cleaned);
        for (const legacyKey of before) set(legacyKey, null);
        return kept;
      }

      return {
        read(instanceUrl) {
          return instances().get(instanceUrl) ?? kind.fallback;
        },
        write(instanceUrl, value) {
          const others: (readonly [string, T])[] = [...instances()].filter(
            ([url]) => url !== instanceUrl,
          );
          const kept = keptOf(
            instanceUrl.length <= MAX_INSTANCE_URL && !isFallback(value, kind)
              ? [[instanceUrl, value] as const, ...others]
              : others,
          );
          const text = JSON.stringify(Object.fromEntries(kept));
          set(key, text === "{}" ? null : text);
        },
      };
    },
  };
}

/** The value kept as JSON `text`, as `kind` reads it; the fallback when the text is not JSON. */
function decoded<T>(text: string, kind: ValueKind<T>): T {
  let stored: unknown;
  try {
    stored = JSON.parse(text);
  } catch {
    return kind.fallback;
  }
  return kind.decode(stored);
}

/** Whether `value` is its kind's fallback, or is kept as the fallback would be. */
function isFallback<T>(value: T, kind: { fallback: T; text?: boolean }): boolean {
  return (
    value === kind.fallback ||
    (kind.text !== true && JSON.stringify(value) === JSON.stringify(kind.fallback))
  );
}

/**
 * The instances kept of those given, the last written first: at most
 * KEPT_INSTANCES of them, each one that still fits in
 * MAX_INSTANCES_CHARACTERS with those kept before it, as JSON.stringify
 * writes them; one that does not is left out, and the next is tried. An
 * instance given twice is kept as given first.
 */
function keptOf<T>(instances: Iterable<readonly [string, T]>): Map<string, T> {
  const keeping = new Map<string, T>();
  let characters = "{}".length;
  for (const [instanceUrl, value] of instances) {
    if (keeping.size === KEPT_INSTANCES) break;
    if (keeping.has(instanceUrl)) continue;
    // `"url":…`, and the comma before it when it is not the first.
    const entry =
      JSON.stringify({ [instanceUrl]: value }).length - "{}".length + (keeping.size > 0 ? 1 : 0);
    // One that does not fit is skipped, not the end: those after it may still fit.
    if (characters + entry > MAX_INSTANCES_CHARACTERS) continue;
    keeping.set(instanceUrl, value);
    characters += entry;
  }
  return keeping;
}
