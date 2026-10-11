import { describe, expect, it } from "vitest";
import { ensureTrailingSlash, lastPathSegment } from "./urls";

describe("ensureTrailingSlash", () => {
  it("appends a slash when missing", () => {
    expect(ensureTrailingSlash("https://pod.example/a")).toBe("https://pod.example/a/");
  });

  it("keeps an existing slash", () => {
    expect(ensureTrailingSlash("https://pod.example/a/")).toBe("https://pod.example/a/");
  });
});

describe("lastPathSegment", () => {
  it("returns the last segment of a container URL", () => {
    expect(lastPathSegment("https://pod.example/solid-memo/japanese/")).toBe("japanese");
  });

  it("decodes percent-encoding", () => {
    expect(lastPathSegment("https://pod.example/mem%C3%B3/")).toBe("memó");
  });

  it("falls back to the input for a root URL", () => {
    expect(lastPathSegment("https://pod.example/")).toBe("https://pod.example/");
  });
});
