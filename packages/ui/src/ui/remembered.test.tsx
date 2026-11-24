// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { makeDeviceValuesFake } from "../test/fakes/deviceValues";
import { UNKEPT_VALUES } from "./deviceValues";
import {
  COLLAPSED_KEY,
  collapsedGroups,
  forget,
  loginWebIdKey,
  noteLoginWebId,
  rememberedWebId,
  settleLoginWebId,
  webIdKey,
  recentLanguages,
  rememberCollapsed,
  rememberLanguage,
  useRemembered,
} from "./remembered";

function Counter({ memoryKey }: { memoryKey: string }) {
  const [count, setCount] = useRemembered(memoryKey, 0);
  return <button onClick={() => setCount((n) => n + 1)}>{count}</button>;
}

describe("useRemembered", () => {
  it("starts from the initial value", () => {
    render(<Counter memoryKey="fresh" />);
    expect(screen.getByRole("button")).toHaveTextContent("0");
  });

  it("brings the value back when a component asks for its key again", () => {
    const first = render(<Counter memoryKey="kept" />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button"));
    first.unmount();
    render(<Counter memoryKey="kept" />);
    expect(screen.getByRole("button")).toHaveTextContent("2");
  });

  it("keeps each key's value apart", () => {
    const first = render(<Counter memoryKey="one" />);
    fireEvent.click(screen.getByRole("button"));
    first.unmount();
    render(<Counter memoryKey="two" />);
    expect(screen.getByRole("button")).toHaveTextContent("0");
  });

  it("starts afresh once the key is forgotten", () => {
    const first = render(<Counter memoryKey="dropped" />);
    fireEvent.click(screen.getByRole("button"));
    first.unmount();
    forget("dropped");
    render(<Counter memoryKey="dropped" />);
    expect(screen.getByRole("button")).toHaveTextContent("0");
  });
});

describe("recent languages", () => {
  let device = makeDeviceValuesFake();
  beforeEach(() => {
    device = makeDeviceValuesFake();
  });

  it("are none at first", () => {
    expect(recentLanguages("deck", device)).toEqual([]);
  });

  it("lists the latest choice first, each once, five at most", () => {
    for (const tag of ["en", "sv", "fi", "de", "sv", "ja", "fr"])
      rememberLanguage("own", tag, device);
    expect(recentLanguages("own", device)).toEqual(["fr", "ja", "sv", "de", "fi"]);
  });

  it("keeps a deck's text and a card's own text apart", () => {
    rememberLanguage("deck", "sv", device);
    expect(recentLanguages("deck", device)).toEqual(["sv"]);
    expect(recentLanguages("own", device)).toEqual([]);
  });

  it("are kept on this device, past the page", () => {
    rememberLanguage("deck", "pt-br", device);
    expect(JSON.parse(device.stored.get("solid-memo:recentLanguages.deck")!)).toEqual(["pt-br"]);
  });

  it("leave out what is not a language tag as the app stores it, each once, five at most", () => {
    device.stored.set(
      "solid-memo:recentLanguages.own",
      JSON.stringify(["sv", 7, "PT-BR", "x-private", "fi", "sv", "de", "ja", "fr", "en"]),
    );
    expect(recentLanguages("own", device)).toEqual(["sv", "fi", "de", "ja", "fr"]);
    device.stored.set("solid-memo:recentLanguages.own", JSON.stringify({ sv: true }));
    expect(recentLanguages("own", device)).toEqual([]);
  });

  it("are none, and are not kept, where the device keeps nothing", () => {
    rememberLanguage("deck", "sv", UNKEPT_VALUES);
    expect(recentLanguages("deck", UNKEPT_VALUES)).toEqual([]);
  });
});

describe("collapsed deck groups", () => {
  const a = "https://pod.example/solid-memo/a/";
  const b = "https://pod.example/solid-memo/b/";
  let device = makeDeviceValuesFake();
  beforeEach(() => {
    device = makeDeviceValuesFake();
  });

  it("are none at first", () => {
    expect(collapsedGroups(a, device)).toEqual([]);
  });

  it("are kept on this device, for each instance apart, under one key", () => {
    rememberCollapsed(a, [`${a}catalog.ttl#group-1`], device);
    expect(collapsedGroups(a, device)).toEqual([`${a}catalog.ttl#group-1`]);
    expect(collapsedGroups(b, device)).toEqual([]);
    expect(JSON.parse(device.stored.get(COLLAPSED_KEY)!)).toEqual({
      [a]: [`${a}catalog.ttl#group-1`],
    });
  });

  it("leave out what is not a URL as the app stores it", () => {
    device.stored.set(COLLAPSED_KEY, JSON.stringify({ [a]: ["x", 7], [b]: { x: true } }));
    expect(collapsedGroups(a, device)).toEqual(["x"]);
    expect(collapsedGroups(b, device)).toEqual([]);
  });

  it("are moved in from where they were kept before, one key an instance", () => {
    const instanceDeviceValues = vi.fn(UNKEPT_VALUES.instanceDeviceValues);
    collapsedGroups(a, {
      ...UNKEPT_VALUES,
      instanceDeviceValues: instanceDeviceValues as typeof UNKEPT_VALUES.instanceDeviceValues,
    });
    expect(instanceDeviceValues).toHaveBeenCalledWith(
      COLLAPSED_KEY,
      expect.objectContaining({ legacyPrefix: "solid-memo:collapsedGroups." }),
    );
  });
});

describe("the remembered WebID", () => {
  const webId = "https://alice.example/profile/card#me";
  let device = makeDeviceValuesFake();
  beforeEach(() => {
    device = makeDeviceValuesFake();
  });

  it("is none at first", () => {
    expect(rememberedWebId(device)).toBeNull();
  });

  it("is kept, as its text, once the login with it succeeds", () => {
    noteLoginWebId(webId, true, device);
    // Not before the login has come back.
    expect(rememberedWebId(device)).toBeNull();
    expect(device.tab.get(loginWebIdKey)).toBe(webId);
    settleLoginWebId(webId, device);
    expect(rememberedWebId(device)).toBe(webId);
    expect(device.stored.get(webIdKey)).toBe(webId);
    expect(device.tab.get(loginWebIdKey)).toBeUndefined();
  });

  it("is not kept when the login fails or comes back as someone else", () => {
    noteLoginWebId(webId, true, device);
    settleLoginWebId(null, device);
    expect(rememberedWebId(device)).toBeNull();
    expect(device.tab.get(loginWebIdKey)).toBeUndefined();

    noteLoginWebId(webId, true, device);
    settleLoginWebId("https://bob.example/profile/card#me", device);
    expect(rememberedWebId(device)).toBeNull();
  });

  it("keeps nothing for a login that was not asked to remember", () => {
    settleLoginWebId(webId, device);
    expect(rememberedWebId(device)).toBeNull();
  });

  it("is forgotten when a login is not asked to remember it", () => {
    device.stored.set(webIdKey, webId);
    device.tab.set(loginWebIdKey, webId);
    noteLoginWebId(webId, false, device);
    expect(rememberedWebId(device)).toBeNull();
    expect(device.stored.get(webIdKey)).toBeUndefined();
    expect(device.tab.get(loginWebIdKey)).toBeUndefined();
  });

  it("ignores what is not a valid WebID as kept", () => {
    device.stored.set(webIdKey, "http://alice.example/profile/card#me");
    expect(rememberedWebId(device)).toBeNull();
    // Valid, but not as the form would have kept it.
    device.stored.set(webIdKey, ` ${webId}`);
    expect(rememberedWebId(device)).toBeNull();
  });

  it("remembers none, and fails nothing, where the device keeps nothing", () => {
    expect(() => noteLoginWebId(webId, true, UNKEPT_VALUES)).not.toThrow();
    expect(() => settleLoginWebId(webId, UNKEPT_VALUES)).not.toThrow();
    expect(rememberedWebId(UNKEPT_VALUES)).toBeNull();
  });
});
