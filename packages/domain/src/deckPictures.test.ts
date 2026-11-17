// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { Deck } from "./deck";
import {
  MAX_PICTURE_HOSTS,
  pictureHost,
  storedPictureHosts,
  withPictureHost,
} from "./deckPictures";

describe("pictureHost", () => {
  it("names the host a picture's address asks, with a port that is not the default", () => {
    expect(pictureHost("https://Pictures.Example/a.png")).toBe("pictures.example");
    expect(pictureHost("http://pictures.example:8080/a.png")).toBe("pictures.example:8080");
    expect(pictureHost("https://pictures.example:443/a.png")).toBe("pictures.example");
  });

  it("names the host the browser asks, not one written as a user name", () => {
    expect(pictureHost("https://trusted.example@other.example/a.png")).toBe("other.example");
  });

  it("names none for an address that is no http(s) one", () => {
    expect(pictureHost("ftp://pictures.example/a.png")).toBeNull();
    expect(pictureHost("not a url")).toBeNull();
  });
});

describe("storedPictureHosts", () => {
  it("keeps each host once, and only what pictureHost would name", () => {
    expect(
      storedPictureHosts([
        "a.example",
        "a.example",
        "b.example:8080",
        "https://c.example/",
        "D.example",
        "e.example:443",
        "user@f.example",
        "",
      ]),
    ).toEqual(["a.example", "b.example:8080", "e.example:443"]);
  });

  it("keeps a port that is the other scheme's default, as a picture's address names it, and not one that is its own", () => {
    expect(pictureHost("http://chosen.example:443/a.png")).toBe("chosen.example:443");
    expect(storedPictureHosts(["chosen.example:443", "chosen.example:80"])).toEqual([
      "chosen.example:443",
      "chosen.example:80",
    ]);
  });
});

describe("storedPictureHosts, bounded (GHSA-jmrw-gq3f-r4g6)", () => {
  const hosts = (count: number) => Array.from({ length: count }, (_, i) => `h${i}.example`);

  it("keeps the first MAX_PICTURE_HOSTS hosts, counting each once and only hosts", () => {
    const many = hosts(MAX_PICTURE_HOSTS + 5);
    expect(storedPictureHosts(["https://x.example/", ...many.slice(0, 3), ...many])).toEqual(
      many.slice(0, MAX_PICTURE_HOSTS),
    );
  });

  it("leaves out a host longer than a DNS name may be", () => {
    const longest = `${"a".repeat(61)}.`.repeat(4).padEnd(253, "b");
    expect(storedPictureHosts([longest, `${longest}c`])).toEqual([longest]);
  });
});

describe("withPictureHost", () => {
  const deck = { url: "https://pod.example/catalog.ttl#d" } as Deck;

  it("adds a host once and takes it away, leaving none out altogether", () => {
    const shown = withPictureHost(deck, "a.example", true);
    expect(shown.pictureHosts).toEqual(["a.example"]);
    expect(withPictureHost(shown, "a.example", true).pictureHosts).toEqual(["a.example"]);
    expect(withPictureHost(shown, "b.example", true).pictureHosts).toEqual([
      "a.example",
      "b.example",
    ]);
    expect(withPictureHost(shown, "a.example", false)).toEqual(deck);
    expect(withPictureHost(deck, "a.example", false)).toEqual(deck);
  });

  it("keeps the latest choice past MAX_PICTURE_HOSTS, leaving the first out", () => {
    const full = Array.from({ length: MAX_PICTURE_HOSTS }, (_, i) => `h${i}.example`);
    const shown = withPictureHost({ ...deck, pictureHosts: full }, "new.example", true);
    expect(shown.pictureHosts).toEqual([...full.slice(1), "new.example"]);
  });

  it("adds no host longer than a DNS name, and leaves none out for it", () => {
    const full = Array.from({ length: MAX_PICTURE_HOSTS }, (_, i) => `h${i}.example`);
    const long = `${"a".repeat(250)}.example`;
    const shown = withPictureHost({ ...deck, pictureHosts: full }, long, true);
    expect(shown.pictureHosts).toEqual(full);
  });
});
