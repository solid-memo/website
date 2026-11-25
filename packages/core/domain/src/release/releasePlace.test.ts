// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  isDraftsPlaceOnward,
  isEarlierVersionBeside,
  isPublishedReleaseUrl,
  isReleaseContainer,
  isReleaseOfSameInstance,
  releaseFileName,
  releaseInstanceOf,
  releasePlaceOf,
  releasesContainerOf,
  releaseUrlIn,
} from "./releasePlace.ts";

const INSTANCE = "https://pod.example/solid-memo/main/";

describe("where a release is published", () => {
  it("is the instance's releases folder, by name and version, unless another is chosen", () => {
    expect(releasesContainerOf(INSTANCE.slice(0, -1))).toBe(`${INSTANCE}releases/`);
    expect(releaseUrlIn(`${INSTANCE}releases/`, "capitals", 2)).toBe(
      `${INSTANCE}releases/capitals/v2.ttl`,
    );
    expect(releaseUrlIn("https://pod.example/public", "capitals", 1)).toBe(
      "https://pod.example/public/capitals/v1.ttl",
    );
  });

  it("is a folder's address: http(s), ending in a slash, with no query or fragment", () => {
    expect(isReleaseContainer("https://pod.example/public/")).toBe(true);
    expect(isReleaseContainer("http://localhost:3000/a/")).toBe(true);
    expect(isReleaseContainer("https://pod.example/public")).toBe(false);
    expect(isReleaseContainer("https://pod.example/a/?x=1/")).toBe(false);
    expect(isReleaseContainer("https://pod.example/a/#b/")).toBe(false);
    expect(isReleaseContainer("ftp://pod.example/a/")).toBe(false);
    expect(isReleaseContainer("pod.example/a/")).toBe(false);
    // Not as the URL would write it: a space, say.
    expect(isReleaseContainer("https://pod.example/a b/")).toBe(false);
  });

  it("names a release by its address, or not at all", () => {
    expect(releasePlaceOf(`${INSTANCE}releases/capitals/v12.ttl`)).toEqual({
      name: "capitals",
      version: 12,
    });
    expect(releasePlaceOf(`${INSTANCE}releases/Capitals/v1.ttl`)).toBeNull();
    expect(releasePlaceOf(`${INSTANCE}releases/capitals/v0.ttl`)).toBeNull();
    expect(releasePlaceOf(`${INSTANCE}capitals.ttl`)).toBeNull();
  });

  it("saves a release as a file named after it", () => {
    expect(releaseFileName("capitals", 3)).toBe("capitals-v3.ttl");
  });
});

describe("the instance a release was published from (GHSA-hx4f-4hjp-g2f3)", () => {
  const V1 = `${INSTANCE}releases/capitals/v1.ttl`;

  it("is the folder above the releases folder its address names, or none", () => {
    expect(releaseInstanceOf(V1)).toBe(INSTANCE);
    expect(releaseInstanceOf("https://pod.example/releases/capitals/v1.ttl")).toBe(
      "https://pod.example/",
    );
    // Published in another folder, or at an address no release has.
    expect(releaseInstanceOf("https://pod.example/public/capitals/v1.ttl")).toBeNull();
    expect(releaseInstanceOf("https://pod.example/capitals/v1.ttl")).toBeNull();
    expect(releaseInstanceOf(`${INSTANCE}releases/capitals/v1.ttl?x=1`)).toBeNull();
  });

  it("holds the instance's releases, under any name, and no others", () => {
    expect(isReleaseOfSameInstance(V1, `${INSTANCE}releases/capitals/v2.ttl`)).toBe(true);
    expect(isReleaseOfSameInstance(V1, `${INSTANCE}releases/capitals-2/v3.ttl`)).toBe(true);
    expect(isReleaseOfSameInstance(V1, `${INSTANCE}public/capitals/v3.ttl`)).toBe(true);
    // Another instance, a folder above, another origin.
    expect(
      isReleaseOfSameInstance(V1, "https://pod.example/solid-memo/other/releases/capitals/v2.ttl"),
    ).toBe(false);
    expect(isReleaseOfSameInstance(V1, "https://pod.example/releases/capitals/v2.ttl")).toBe(false);
    expect(
      isReleaseOfSameInstance(V1, "https://evil.example/solid-memo/main/releases/capitals/v2.ttl"),
    ).toBe(false);
    // An address no release has, or a release whose address names no instance.
    expect(isReleaseOfSameInstance(V1, `${INSTANCE}releases/capitals/v2.ttl#x`)).toBe(false);
    expect(
      isReleaseOfSameInstance(
        "https://pod.example/public/capitals/v1.ttl",
        "https://pod.example/public/capitals/v2.ttl",
      ),
    ).toBe(false);
  });
});

describe("isPublishedReleaseUrl", () => {
  it("is an http(s) address named as a release is, as a request sends it", () => {
    expect(isPublishedReleaseUrl("https://pod.example/solid-memo/main/releases/solid/v1.ttl")).toBe(
      true,
    );
    expect(isPublishedReleaseUrl("http://pod.example/shared/capitals/v12.ttl")).toBe(true);
    for (const url of [
      "https://pod.example/solid-memo/main/releases/../../../profile/v1.ttl",
      "https://pod.example/solid-memo/main/%2e%2e/solid/v1.ttl",
      "HTTPS://POD.EXAMPLE/solid/v1.ttl",
      "https://pod.example:443/solid/v1.ttl",
      "https://pod.example/solid/v1.ttl?x",
      "https://pod.example/solid/v1.ttl#x",
      "https://pod.example/profile/card",
      "urn:x:solid/v1.ttl",
      "https://evil.example//pod.example/solid/v1.ttl",
      "https://pod.example/a//solid/v1.ttl",
      "https://user@pod.example/solid/v1.ttl",
      "https://:secret@pod.example/solid/v1.ttl",
      "https://user:secret@pod.example/solid/v1.ttl",
    ]) {
      expect(isPublishedReleaseUrl(url), url).toBe(false);
    }
  });
});

describe("a version beside a release", () => {
  const V2 = "https://pod.example/shared/capitals/v2.ttl";

  it("is earlier at a release's address in its folder, of a lower version", () => {
    expect(isEarlierVersionBeside(V2, "https://pod.example/shared/capitals/v1.ttl")).toBe(true);
    for (const iri of [
      V2,
      "https://pod.example/shared/capitals/v3.ttl",
      "https://pod.example/shared/capitals/v1.ttl#x",
      "https://pod.example/other/capitals/v1.ttl",
      "https://pod.example/shared/capitals/one.ttl",
    ])
      expect(isEarlierVersionBeside(V2, iri)).toBe(false);
    expect(isEarlierVersionBeside("https://pod.example/shared/capitals.ttl", V2)).toBe(false);
  });
});

describe("isDraftsPlaceOnward", () => {
  const DRAFT = "https://pod.example/memo/drafts/capitals/v2/release.ttl";
  const at = (path: string) => `https://pod.example/memo/releases/capitals/${path}`;

  it("is where the draft is published by default, a later version there, or a subject of one", () => {
    for (const iri of [at("v2.ttl"), at("v2.ttl#x"), at("v3.ttl"), at("v10.ttl#series")])
      expect(isDraftsPlaceOnward(DRAFT, iri)).toBe(true);
    for (const iri of [
      at("v1.ttl"),
      at("v1.ttl#x"),
      at("v02.ttl"),
      at("v3.ttl/x"),
      at("other.ttl"),
      "https://pod.example/memo/releases/other/v3.ttl",
      "https://elsewhere.example/memo/releases/capitals/v3.ttl",
      "_:b0",
    ])
      expect(isDraftsPlaceOnward(DRAFT, iri)).toBe(false);
    expect(isDraftsPlaceOnward(at("v1.ttl"), at("v2.ttl"))).toBe(false);
  });
});
