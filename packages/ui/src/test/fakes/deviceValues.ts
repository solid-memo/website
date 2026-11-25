// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { type ComponentChildren, h } from "preact";
import type { DeviceValueKind, DeviceValueUseCases } from "@solid-memo/application/deviceValues";
import { DeviceValues } from "../../ui/deviceValues";

/**
 * The values a device keeps, faked in memory: `stored` holds each value
 * as the browser would, by key, as JSON (or its text, for a kind kept as
 * text), so a test may put there what a device holds and see what is
 * kept; a value for each instance is kept as one object by instance URL.
 * A value that is its fallback is kept as none. The tab's values are
 * kept apart, in `tab`. Nothing is bounded, as the browser's store is.
 */
export function makeDeviceValuesFake(): DeviceValueUseCases & {
  stored: Map<string, string>;
  tab: Map<string, string>;
} {
  const stored = new Map<string, string>();
  const tab = new Map<string, string>();
  const encode = <T>(value: T, text: boolean | undefined) =>
    text === true ? String(value) : JSON.stringify(value);
  const decode = <T>(
    raw: string | undefined,
    kind: DeviceValueKind<T>,
    text: boolean | undefined,
  ) => {
    if (raw === undefined) return kind.fallback;
    if (text === true) return kind.decode(raw);
    try {
      return kind.decode(JSON.parse(raw));
    } catch {
      return kind.fallback;
    }
  };
  const isFallback = <T>(value: T, kind: DeviceValueKind<T>) =>
    value === kind.fallback || JSON.stringify(value) === JSON.stringify(kind.fallback);
  const valueIn =
    (map: Map<string, string>): DeviceValueUseCases["deviceValue"] =>
    (key, kind) => ({
      read: () => decode(map.get(key), kind, kind.text),
      write: (value) => {
        if (isFallback(value, kind)) map.delete(key);
        else map.set(key, encode(value, kind.text));
      },
    });
  return {
    stored,
    tab,
    deviceValue: valueIn(stored),
    tabValue: valueIn(tab),
    instanceDeviceValues: (key, kind) => {
      const all = (): Record<string, unknown> => {
        const value = decode(stored.get(key), { decode: (each) => each, fallback: null }, false);
        return typeof value === "object" && value !== null && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
      };
      return {
        read: (instanceUrl) => {
          const value = all()[instanceUrl];
          return value === undefined ? kind.fallback : kind.decode(value);
        },
        write: (instanceUrl, value) => {
          const { [instanceUrl]: _was, ...others } = all();
          const next = isFallback(value, kind) ? others : { [instanceUrl]: value, ...others };
          if (Object.keys(next).length === 0) stored.delete(key);
          else stored.set(key, JSON.stringify(next));
        },
      };
    },
  };
}

/** A wrapper for `render` that gives the screens `device` as the values this device keeps (DeviceValues). */
export function deviceWrapper(device: DeviceValueUseCases) {
  return ({ children }: { children?: ComponentChildren }) =>
    h(DeviceValues.Provider, { value: device }, children);
}

/** What a fake of the use cases made by makeUseCasesFake keeps on its device: its `stored` and `tab`. */
export function keptBy(useCases: object): {
  stored: Map<string, string>;
  tab: Map<string, string>;
} {
  return useCases as ReturnType<typeof makeDeviceValuesFake>;
}
