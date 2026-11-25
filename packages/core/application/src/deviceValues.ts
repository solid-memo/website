// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type {
  DeviceStore,
  DeviceValue,
  DeviceValueKind,
  InstanceDeviceValues,
  InstanceValueKind,
} from "./ports/device";

// The kinds of value a screen keeps, which it says what each looks like with: the screens name no port.
export type { DeviceValueKind, InstanceValueKind } from "./ports/device";

/**
 * The values the screens keep on this device, each of a kind the screen
 * that keeps it says (DeviceValueKind): how the deck list is folded, the
 * languages chosen lately, the WebID to remember, the Studio's layout.
 * Where they are kept, and how much of them, is the stores' (DeviceStore).
 */
export interface DeviceValueUseCases {
  /** A value kept on this device under `key`. */
  deviceValue<T>(key: string, kind: DeviceValueKind<T>): DeviceValue<T>;
  /** A value kept on this device for each instance, under `key`. */
  instanceDeviceValues<T>(key: string, kind: InstanceValueKind<T>): InstanceDeviceValues<T>;
  /** A value kept for the tab's life under `key`: past a reload, and gone with the tab. */
  tabValue<T>(key: string, kind: DeviceValueKind<T>): DeviceValue<T>;
}

/** The values kept on this device (`deviceStore`) and for the tab's life (`tabStore`). */
export function createDeviceValueUseCases({
  deviceStore,
  tabStore,
}: {
  deviceStore: DeviceStore;
  tabStore: DeviceStore;
}): DeviceValueUseCases {
  return {
    deviceValue: (key, kind) => deviceStore.value(key, kind),
    instanceDeviceValues: (key, kind) => deviceStore.byInstance(key, kind),
    tabValue: (key, kind) => tabStore.value(key, kind),
  };
}

/**
 * A DeviceStore that keeps nothing: every value is its kind's fallback,
 * and a write is dropped. For a page that keeps nothing of its own on
 * the device, such as a Studio trial, whose page is the app's.
 */
export const UNKEPT_STORE: DeviceStore = {
  value: (_key, { fallback }) => ({ read: () => fallback, write: () => undefined }),
  byInstance: (_key, { fallback }) => ({ read: () => fallback, write: () => undefined }),
};
