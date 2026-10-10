import { describe, expect, it } from "vitest";
import { isReleaseContainer, releaseFileName, releasePlaceOf, releasesContainerOf, releaseUrlIn } from "./releasePlace.ts";

const INSTANCE = "https://pod.example/solid-memo/main/";

describe("where a release is published", () => {
  it("is the instance's releases folder, by name and version, unless another is chosen", () => {
    expect(releasesContainerOf(INSTANCE.slice(0, -1))).toBe(`${INSTANCE}releases/`);
    expect(releaseUrlIn(`${INSTANCE}releases/`, "capitals", 2)).toBe(`${INSTANCE}releases/capitals/v2.ttl`);
    expect(releaseUrlIn("https://pod.example/public", "capitals", 1)).toBe("https://pod.example/public/capitals/v1.ttl");
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
    expect(releasePlaceOf(`${INSTANCE}releases/capitals/v12.ttl`)).toEqual({ name: "capitals", version: 12 });
    expect(releasePlaceOf(`${INSTANCE}releases/Capitals/v1.ttl`)).toBeNull();
    expect(releasePlaceOf(`${INSTANCE}releases/capitals/v0.ttl`)).toBeNull();
    expect(releasePlaceOf(`${INSTANCE}capitals.ttl`)).toBeNull();
  });

  it("saves a release as a file named after it", () => {
    expect(releaseFileName("capitals", 3)).toBe("capitals-v3.ttl");
  });
});
