// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { buildThing, createThing } from "./client/rdf";
import {
  createPlacesFetch,
  isInPlaces,
  ownProfileArea,
  profilePlacesOf,
  readNothing,
  storageUrlsOf,
} from "./profilePlaces";

/** The profile's terms (ns/bounds/profile.ttl). */
const PIM = {
  preferencesFile: "http://www.w3.org/ns/pim/space#preferencesFile",
  storage: "http://www.w3.org/ns/pim/space#storage",
} as const;

const WEBID = "https://id.example/alice#me";

describe("profilePlacesOf", () => {
  it("is the WebID's origin, its document's, and the storages the WebID document names", () => {
    const me = buildThing(createThing({ url: WEBID }))
      .addIri(PIM.storage, "https://storage.example/alice/")
      .addIri(PIM.storage, "https://backup.example/alice")
      .build();
    expect(profilePlacesOf(WEBID, "https://profile.example/alice/card", me)).toEqual([
      "https://id.example/",
      "https://profile.example/",
      "https://storage.example/alice/",
      "https://backup.example/alice",
    ]);
  });

  it("leaves out a document address that is none, and a subject that is not there", () => {
    expect(profilePlacesOf(WEBID, "", null)).toEqual(["https://id.example/"]);
  });
});

describe("ownProfileArea", () => {
  it("is the user's storages, or the WebID's own pod when none is known", () => {
    expect(ownProfileArea(WEBID, ["https://storage.example/alice/"])).toEqual([
      "https://storage.example/alice/",
    ]);
    expect(ownProfileArea("https://pod.example/alice/profile/card#me", [])).toEqual([
      "https://pod.example/alice/",
    ]);
    expect(ownProfileArea("https://pod.example/people/alice/card#me", [])).toEqual([
      "https://pod.example/people/alice/",
    ]);
  });

  it("is nowhere when no storage is known and the WebID's own pod would be the whole origin", () => {
    expect(ownProfileArea("https://pod.example/alice#me", [])).toEqual([]);
    expect(ownProfileArea("https://pod.example/profile/card#me", [])).toEqual([]);
    expect(ownProfileArea("urn:x:y", [])).toEqual([]);
    expect(ownProfileArea("https://pod.example/alice#me", ["https://pod.example/"])).toEqual([
      "https://pod.example/",
    ]);
  });
});

describe("storageUrlsOf", () => {
  it("takes each storage as a request sends it, once, and leaves out text that is no URL", () => {
    expect(
      storageUrlsOf([
        "https://pod.example/alice/",
        "https://POD.example/alice/./",
        "https://pod.example/alice/../mallory/",
        "https://pod.example/alice/%2e%2E/mallory/",
        "not a url",
      ]),
    ).toEqual(["https://pod.example/alice/", "https://pod.example/mallory/"]);
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
