// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { createDeviceValueUseCases, UNKEPT_STORE } from "./deviceValues";
import type { DeviceStore } from "./ports/device";

const KIND = { decode: (stored: unknown) => String(stored), fallback: "none" };

/** A store whose every value and instance's value is `name`, and whose calls are noted. */
function storeNamed(name: string): DeviceStore {
  const kept = { read: () => name, write: vi.fn() };
  return {
    value: vi.fn(() => kept) as DeviceStore["value"],
    byInstance: vi.fn(() => kept) as DeviceStore["byInstance"],
  };
}

describe("createDeviceValueUseCases", () => {
  it("keeps a value, and a value for each instance, on the device, and a tab's value in the tab", () => {
    const deviceStore = storeNamed("device");
    const tabStore = storeNamed("tab");
    const values = createDeviceValueUseCases({ deviceStore, tabStore });
    const legacy = { ...KIND, legacyPrefix: "old." };

    expect(values.deviceValue("a", KIND).read()).toBe("device");
    expect(values.instanceDeviceValues("b", legacy).read("https://pod.example/i/")).toBe("device");
    expect(values.tabValue("c", KIND).read()).toBe("tab");
    expect(deviceStore.value).toHaveBeenCalledWith("a", KIND);
    expect(deviceStore.byInstance).toHaveBeenCalledWith("b", legacy);
    expect(tabStore.value).toHaveBeenCalledWith("c", KIND);
  });
});

describe("UNKEPT_STORE", () => {
  it("keeps nothing: every value is its fallback", () => {
    const value = UNKEPT_STORE.value("a", KIND);
    value.write("kept");
    expect(value.read()).toBe("none");
    const byInstance = UNKEPT_STORE.byInstance("b", KIND);
    byInstance.write("https://pod.example/i/", "kept");
    expect(byInstance.read("https://pod.example/i/")).toBe("none");
  });
});
