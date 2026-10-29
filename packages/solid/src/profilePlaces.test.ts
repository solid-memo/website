// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { buildThing, createThing } from "./client/rdf";
import { createPlacesFetch, isInPlaces, profilePlacesOf, readNothing } from "./profilePlaces";
import { PIM } from "./vocab";

const WEBID = "https://id.example/alice#me";

describe("profilePlacesOf", () => {
  it("is the WebID's origin, its document's, and the storages the subjects name", () => {
    const me = buildThing(createThing({ url: WEBID }))
      .addIri(PIM.storage, "https://storage.example/alice/")
      .build();
    const more = buildThing(createThing({ url: WEBID }))
      .addIri(PIM.storage, "https://backup.example/alice")
      .build();
    expect(profilePlacesOf(WEBID, "https://profile.example/alice/card", [me, more])).toEqual([
      "https://id.example/",
      "https://profile.example/",
      "https://storage.example/alice/",
      "https://backup.example/alice",
    ]);
  });

  it("leaves out a document address that is none", () => {
    expect(profilePlacesOf(WEBID, "", [])).toEqual(["https://id.example/"]);
  });
});

describe("isInPlaces", () => {
  const places = ["https://id.example/", "https://storage.example/alice"];

  it("takes an address in one of the places, and no other", () => {
    expect(isInPlaces("https://id.example/alice", places)).toBe(true);
    expect(isInPlaces("https://storage.example/alice/profile", places)).toBe(true);
    expect(isInPlaces("https://storage.example/bob/profile", places)).toBe(false);
    expect(isInPlaces("https://storage.example/alice/../bob/profile", places)).toBe(false);
    expect(isInPlaces("https://elsewhere.example/doc", places)).toBe(false);
  });
});

describe("createPlacesFetch", () => {
  it("is the user in the places, reads anywhere else through the public fetch and writes nothing there", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("own"));
    const publicFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("public"));
    const placesFetch = createPlacesFetch(["https://id.example/"], fetch, publicFetch);

    expect(await (await placesFetch("https://id.example/settings/index.ttl")).text()).toBe("own");
    expect(await (await placesFetch("https://elsewhere.example/doc")).text()).toBe("public");
    await expect(
      placesFetch("https://elsewhere.example/doc", { method: "PATCH" }),
    ).rejects.toMatchObject({ code: "writeOutsidePod", vars: { host: "elsewhere.example" } });
    expect(fetch).toHaveBeenCalledOnce();
    expect(publicFetch).toHaveBeenCalledOnce();
  });
});

describe("readNothing", () => {
  it("sends nothing, and says what it did not read", async () => {
    await expect(readNothing("https://elsewhere.example/doc")).rejects.toThrow(
      "<https://elsewhere.example/doc>",
    );
    await expect(readNothing(new Request("https://elsewhere.example/req"))).rejects.toThrow(
      "<https://elsewhere.example/req>",
    );
  });
});
