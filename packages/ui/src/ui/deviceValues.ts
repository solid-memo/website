// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createContext } from "preact";
import { useContext } from "preact/hooks";
import {
  createDeviceValueUseCases,
  type DeviceValueUseCases,
  UNKEPT_STORE,
} from "@solid-memo/application/deviceValues";

/** Values kept nowhere: each its fallback. What a page keeps without the app's use cases, such as a Studio trial. */
export const UNKEPT_VALUES: DeviceValueUseCases = createDeviceValueUseCases({
  deviceStore: UNKEPT_STORE,
  tabStore: UNKEPT_STORE,
});

/**
 * Where the screens keep what is this device's own (remembered.ts, the
 * Studio's prefs.ts): the app's use cases, which App provides, so that a
 * screen never reaches the browser's storage itself
 * (docs/boundaries.md). Without them, nothing is kept.
 */
export const DeviceValues = createContext<DeviceValueUseCases>(UNKEPT_VALUES);

/** The values this device keeps (DeviceValues). */
export function useDeviceValues(): DeviceValueUseCases {
  return useContext(DeviceValues);
}
