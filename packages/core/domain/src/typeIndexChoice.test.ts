// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  isExposedPrivateIndex,
  isHiddenPublicIndex,
  rankedChoices,
  rankedFor,
  type TypeIndexChoice,
} from "./typeIndexChoice";

function choice(url: string, extra: Partial<TypeIndexChoice> = {}): TypeIndexChoice {
  return {
    url,
    kinds: ["private"],
    fromPreferences: false,
    typeFit: "none",
    holdsInstances: false,
    readableByAnyone: null,
    ...extra,
  };
}

const urls = (choices: readonly TypeIndexChoice[]) => choices.map((c) => c.url);

describe("rankedFor", () => {
  it("puts one holding instances first, then the preferences file's, then one typed as its kind, then by address", () => {
    const choices = [
      choice("https://pod.example/z-plain"),
      choice("https://pod.example/a-plain"),
      choice("https://pod.example/typed", { typeFit: "match" }),
      choice("https://pod.example/preferred", { fromPreferences: true }),
      choice("https://pod.example/holding", { holdsInstances: true }),
    ];
    expect(urls(rankedFor(choices, "private"))).toEqual([
      "https://pod.example/holding",
      "https://pod.example/preferred",
      "https://pod.example/typed",
      "https://pod.example/a-plain",
      "https://pod.example/z-plain",
    ]);
  });

  it("puts last one typed as the other kind, then before it one linked as both", () => {
    const choices = [
      choice("https://pod.example/other", { typeFit: "other", holdsInstances: true }),
      choice("https://pod.example/both", { kinds: ["private", "public"], holdsInstances: true }),
      choice("https://pod.example/plain"),
    ];
    expect(urls(rankedFor(choices, "private"))).toEqual([
      "https://pod.example/plain",
      "https://pod.example/both",
      "https://pod.example/other",
    ]);
  });

  it("puts a public one no one else can read after the others, and only the kind asked for", () => {
    const choices = [
      choice("https://pod.example/hidden", {
        kinds: ["public"],
        readableByAnyone: false,
        holdsInstances: true,
      }),
      choice("https://pod.example/unknown", { kinds: ["public"] }),
      choice("https://pod.example/private"),
    ];
    expect(urls(rankedFor(choices, "public"))).toEqual([
      "https://pod.example/unknown",
      "https://pod.example/hidden",
    ]);
  });

  it("orders by address whatever order they come in", () => {
    const a = choice("https://pod.example/a");
    const b = choice("https://pod.example/b");
    expect(urls(rankedFor([a, b], "private"))).toEqual([a.url, b.url]);
    expect(urls(rankedFor([b, a], "private"))).toEqual([a.url, b.url]);
  });

  it("keeps one address once however often it is given", () => {
    const same = choice("https://pod.example/same");
    expect(rankedFor([same, same], "private")).toEqual([same, same]);
  });
});

describe("rankedChoices", () => {
  it("lists the private ones, one linked as both among them, then the public ones, each once", () => {
    const both = choice("https://pod.example/both", { kinds: ["private", "public"] });
    const own = choice("https://pod.example/private");
    const shown = choice("https://pod.example/public", { kinds: ["public"] });
    expect(rankedChoices([shown, both, own])).toEqual([own, both, shown]);
  });
});

describe("what may make an index the wrong one", () => {
  it("tells a public one no one else can read, and a private one anyone can", () => {
    expect(isHiddenPublicIndex(choice("a", { kinds: ["public"], readableByAnyone: false }))).toBe(
      true,
    );
    expect(isHiddenPublicIndex(choice("a", { kinds: ["public"], readableByAnyone: null }))).toBe(
      false,
    );
    expect(isHiddenPublicIndex(choice("a", { readableByAnyone: false }))).toBe(false);
    expect(isExposedPrivateIndex(choice("a", { readableByAnyone: true }))).toBe(true);
    expect(isExposedPrivateIndex(choice("a", { kinds: ["public"], readableByAnyone: true }))).toBe(
      false,
    );
    expect(isExposedPrivateIndex(choice("a", { readableByAnyone: null }))).toBe(false);
  });
});
