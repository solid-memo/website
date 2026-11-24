// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useState } from "preact/hooks";
import type { DeviceValueUseCases } from "@solid-memo/application/deviceValues";
import type { DeviceValueKind, InstanceValueKind } from "@solid-memo/application/ports";
import { canonicalTag } from "@solid-memo/domain/languageTag";
import { validateWebId } from "@solid-memo/domain/webId";
import { latestFirst } from "@solid-memo/domain/latestFirst";

/** Values kept past their screen, for the life of the page. */
const memory = new Map<string, unknown>();

/**
 * Like useState, but the value outlives the component: it is kept under
 * `key` and comes back when a component asks for that key again. A screen
 * the user leaves for a moment (a deck's page, a preview) is unmounted,
 * and its choices would otherwise be lost on the way back. Kept in memory
 * only, so a reload starts afresh and nothing lands in the browser's storage.
 */
export function useRemembered<T>(
  key: string,
  initial: T,
): [T, (update: (current: T) => T) => void] {
  const [value, setValue] = useState<T>(() => (memory.has(key) ? (memory.get(key) as T) : initial));
  function update(next: (current: T) => T) {
    setValue((current) => {
      const value = next(current);
      memory.set(key, value);
      return value;
    });
  }
  return [value, update];
}

/** Drops what is kept under `key`, so its next screen starts afresh. */
export function forget(key: string): void {
  memory.delete(key);
}

/**
 * Whose language a recent choice was: a deck's own text (its name and
 * description) or a card's own text (its notes, label and pictures'
 * descriptions). Card sides take theirs from the deck's cards instead.
 */
export type RecentLanguageKind = "deck" | "own";

/** How many recent languages are kept of each kind. */
export const RECENT_LANGUAGES = 5;

export const recentKey = (kind: RecentLanguageKind) => `solid-memo:recentLanguages.${kind}`;

/** Recent languages as kept: language tags as the app stores them, each once, RECENT_LANGUAGES at most. */
const RECENT: DeviceValueKind<string[]> = {
  decode: (stored) =>
    Array.isArray(stored)
      ? [
          ...new Set(
            stored.filter(
              (tag): tag is string => typeof tag === "string" && canonicalTag(tag) === tag,
            ),
          ),
        ].slice(0, RECENT_LANGUAGES)
      : [],
  fallback: [],
};

/**
 * The languages last chosen for text of `kind` on this device, the
 * latest first. Kept on the device (DeviceValueUseCases), which may
 * forget them: then there are none, and nothing is preselected from them.
 */
export function recentLanguages(kind: RecentLanguageKind, device: DeviceValueUseCases): string[] {
  return device.deviceValue(recentKey(kind), RECENT).read();
}

/** Notes `tag` as the latest language chosen for text of `kind` on this device. */
export function rememberLanguage(
  kind: RecentLanguageKind,
  tag: string,
  device: DeviceValueUseCases,
): void {
  const recent = device.deviceValue(recentKey(kind), RECENT);
  recent.write(latestFirst(recent.read(), tag, RECENT_LANGUAGES));
}

/** The key the folded deck groups are kept under, by instance URL. */
export const COLLAPSED_KEY = "solid-memo:collapsedGroups";

/** The prefix of the keys they were kept under before, one an instance, the instance's URL after it. */
export const LEGACY_COLLAPSED_PREFIX = "solid-memo:collapsedGroups.";

/** Folded groups as kept: their URLs. */
const COLLAPSED: InstanceValueKind<string[]> = {
  decode: (stored) =>
    Array.isArray(stored) ? stored.filter((url): url is string => typeof url === "string") : [],
  fallback: [],
  legacyPrefix: LEGACY_COLLAPSED_PREFIX,
};

/**
 * The deck groups of an instance the user folded shut on this device,
 * by URL. Kept on the device, never in the pod: how the list is folded
 * is this device's view of it. None when the device forgot them.
 */
export function collapsedGroups(instanceUrl: string, device: DeviceValueUseCases): string[] {
  return device.instanceDeviceValues(COLLAPSED_KEY, COLLAPSED).read(instanceUrl);
}

/** Notes which of an instance's deck groups are folded shut on this device. */
export function rememberCollapsed(
  instanceUrl: string,
  urls: readonly string[],
  device: DeviceValueUseCases,
): void {
  device.instanceDeviceValues(COLLAPSED_KEY, COLLAPSED).write(instanceUrl, [...urls]);
}

export const webIdKey = "solid-memo:webId";
export const loginWebIdKey = "solid-memo:login-webId";

/** The WebID kept, as its text: one the form would have kept, valid and as it is; none of anything else. */
const WEB_ID: DeviceValueKind<string | null> = {
  decode: (stored) => {
    const text = String(stored);
    const validation = validateWebId(text);
    return validation.ok && validation.webId === text ? text : null;
  },
  fallback: null,
  text: true,
};

/** The WebID noted to be remembered while a login is away, as its text. */
const LOGIN_WEB_ID: DeviceValueKind<string | null> = {
  decode: (stored) => String(stored),
  fallback: null,
  text: true,
};

/**
 * The WebID the learner asked this device to remember, once a login
 * with it succeeded (issue #741). Kept on the device, out of the pod: it
 * is no credential, but anyone using the same browser profile can read
 * it, which is why it is kept only when asked for. None when the device
 * keeps none, or keeps something other than a valid WebID.
 */
export function rememberedWebId(device: DeviceValueUseCases): string | null {
  return device.deviceValue(webIdKey, WEB_ID).read();
}

/**
 * Notes, as the learner leaves for their provider, whether to remember
 * the WebID they typed. Not remembering it forgets the one kept now; to
 * remember it, it waits in the tab (`tabValue`) for the login to succeed
 * (settleLoginWebId), so that a WebID whose login fails is never kept.
 */
export function noteLoginWebId(
  webId: string,
  remember: boolean,
  device: DeviceValueUseCases,
): void {
  if (remember) {
    device.tabValue(loginWebIdKey, LOGIN_WEB_ID).write(webId);
  } else {
    device.tabValue(loginWebIdKey, LOGIN_WEB_ID).write(null);
    device.deviceValue(webIdKey, WEB_ID).write(null);
  }
}

/**
 * After the page loads back from a login, or a load without one: keeps
 * the WebID noted to be remembered if the login succeeded with that
 * very WebID (`loggedInAs`, null for none), and drops the note either way.
 */
export function settleLoginWebId(loggedInAs: string | null, device: DeviceValueUseCases): void {
  const note = device.tabValue(loginWebIdKey, LOGIN_WEB_ID);
  const noted = note.read();
  note.write(null);
  if (noted !== null && noted === loggedInAs) device.deviceValue(webIdKey, WEB_ID).write(noted);
}
