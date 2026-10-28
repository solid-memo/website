// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { Deck } from "./deck";
import {
  cardsContainerOf,
  catalogNodeUrlOf,
  catalogUrlOf,
  deckGroupUrlOf,
  documentsInUse,
  instanceUrlOfDeck,
  digestSubjectOf,
  digestUrlOf,
  ensureTrailingSlash,
  historyContainerOf,
  historyUrlOf,
  canonicalUrlOf,
  hasDotSegment,
  instanceAddressOf,
  instanceDocumentUrls,
  isCanonicalUrl,
  isDeckInPlace,
  isDocumentIn,
  isInFolder,
  isPaletteOf,
  isInstanceAddress,
  isPlainHttpUrl,
  isSafeDocumentUrl,
  isSafeWriteUrl,
  isSameUrl,
  monthOfHistoryUrl,
  ownsDocument,
  metaUrlOf,
  palettesUrlOf,
  paletteUrlOf,
  preferencesUrlOf,
  reviewsContainerOf,
} from "./instanceLayout";

const INSTANCE = "https://pod.example/solid-memo/main";

describe("instance layout", () => {
  it("names the fixed documents, with or without a trailing slash", () => {
    expect(ensureTrailingSlash(INSTANCE)).toBe(`${INSTANCE}/`);
    expect(ensureTrailingSlash(`${INSTANCE}/`)).toBe(`${INSTANCE}/`);
    expect(metaUrlOf(INSTANCE)).toBe(`${INSTANCE}/meta.ttl`);
    expect(preferencesUrlOf(`${INSTANCE}/`)).toBe(`${INSTANCE}/preferences.ttl`);
    expect(catalogUrlOf(INSTANCE)).toBe(`${INSTANCE}/catalog.ttl`);
    expect(palettesUrlOf(INSTANCE)).toBe(`${INSTANCE}/palettes.ttl`);
  });

  it("names the containers of the decks' documents, with or without a trailing slash", () => {
    expect(cardsContainerOf(INSTANCE)).toBe(`${INSTANCE}/decks/`);
    expect(reviewsContainerOf(`${INSTANCE}/`)).toBe(`${INSTANCE}/reviews/`);
  });

  it("lists every document of an instance, fixed ones first", () => {
    const deck = {
      cardsDocumentUrl: `${INSTANCE}/decks/deck-1.ttl`,
      reviewsDocumentUrl: `${INSTANCE}/reviews/deck-1.ttl`,
    } as Deck;
    const elsewhere = {
      cardsDocumentUrl: "https://pod.example/kort/spanish.ttl",
      reviewsDocumentUrl: `${INSTANCE}/reviews/%2e%2e/%2e%2e/x.ttl`,
    } as Deck;
    expect(instanceDocumentUrls(INSTANCE, [deck, elsewhere])).toEqual([
      `${INSTANCE}/meta.ttl`,
      `${INSTANCE}/preferences.ttl`,
      `${INSTANCE}/palettes.ttl`,
      `${INSTANCE}/catalog.ttl`,
      `${INSTANCE}/decks/deck-1.ttl`,
      `${INSTANCE}/reviews/deck-1.ttl`,
      "https://pod.example/kort/spanish.ttl",
    ]);
  });
});

describe("the palettes the user designed", () => {
  it("are subjects of the instance's palettes document", () => {
    expect(paletteUrlOf(INSTANCE, "a1")).toBe(`${INSTANCE}/palettes.ttl#palette-a1`);
    expect(isPaletteOf(INSTANCE, paletteUrlOf(INSTANCE, "a1"))).toBe(true);
    // Spelled another way, as a request sends it the same.
    expect(isPaletteOf(INSTANCE, "https://POD.example/solid-memo/main/palettes.ttl#x")).toBe(true);
  });

  it("are read nowhere else", () => {
    for (const iri of [
      `${INSTANCE}/palettes.ttl`,
      `${INSTANCE}/palettes.ttl#`,
      `${INSTANCE}/other.ttl#palette-a1`,
      "https://evil.example/solid-memo/main/palettes.ttl#palette-a1",
      "https://solid-memo.com/ns/vocab/v1.ttl#standardPalette",
      "#palette-a1",
    ])
      expect(isPaletteOf(INSTANCE, iri), iri).toBe(false);
  });
});

describe("deckGroupUrlOf", () => {
  it("is a group subject of the catalog document", () => {
    expect(deckGroupUrlOf(INSTANCE, "x1")).toBe(`${INSTANCE}/catalog.ttl#group-x1`);
  });
});

describe("catalogNodeUrlOf", () => {
  it("names the catalog subject of the instance's catalog document", () => {
    expect(catalogNodeUrlOf(INSTANCE)).toBe(`${INSTANCE}/catalog.ttl#catalog`);
  });
});

describe("the digest", () => {
  const instance = "https://pod.example/solid-memo/main";

  it("is digest.ttl in the instance's container", () => {
    expect(digestUrlOf(instance)).toBe("https://pod.example/solid-memo/main/digest.ttl");
  });

  it("names its subjects by where their document or deck is under the instance", () => {
    expect(digestSubjectOf(instance, "receipt", `${instance}/decks/deck-1.ttl`)).toBe(
      "https://pod.example/solid-memo/main/digest.ttl#receipt-decks-deck-1.ttl",
    );
    expect(digestSubjectOf(instance, "schedule", `${instance}/catalog.ttl#deck-1`)).toBe(
      "https://pod.example/solid-memo/main/digest.ttl#schedule-catalog.ttl-deck-1",
    );
  });

  it("names a subject about a document elsewhere by its whole URL", () => {
    expect(digestSubjectOf(instance, "receipt", "https://other.example/d.ttl")).toBe(
      "https://pod.example/solid-memo/main/digest.ttl#receipt-https---other.example-d.ttl",
    );
  });

  it("keeps the answer log in a document per study month, and knows which month a document is for", () => {
    expect(historyContainerOf(INSTANCE)).toBe(`${INSTANCE}/history/`);
    expect(historyUrlOf(INSTANCE, "2026-10")).toBe(`${INSTANCE}/history/2026-10.ttl`);
    // A study month is all it names: anything else is no document of the answer log.
    for (const month of ["../../x", "2026-1", "2026-10/../../x", "2026-10.ttl", ""]) {
      expect(() => historyUrlOf(INSTANCE, month), month).toThrow("Not a study month");
    }
    expect(monthOfHistoryUrl(INSTANCE, `${INSTANCE}/history/2026-10.ttl`)).toBe("2026-10");
    expect(monthOfHistoryUrl(INSTANCE, `${INSTANCE}/history/notes.ttl`)).toBeNull();
    expect(monthOfHistoryUrl(INSTANCE, `${INSTANCE}/catalog.ttl`)).toBeNull();
  });
});

describe("decks and their documents", () => {
  it("finds the instance a deck is in from its catalog entry", () => {
    expect(instanceUrlOfDeck("https://pod.example/solid-memo/main/catalog.ttl#deck-1")).toBe(
      "https://pod.example/solid-memo/main/",
    );
  });

  it("lists every document the decks use, once", () => {
    const deck = (cards: string, reviews: string) =>
      ({ cardsDocumentUrl: cards, reviewsDocumentUrl: reviews }) as Deck;
    expect([...documentsInUse([deck("a", "b"), deck("a", "c")])]).toEqual(["a", "b", "c"]);
  });
});

describe("where an instance's documents are", () => {
  const ROOT = `${INSTANCE}/`;
  const DECKS = `${ROOT}decks/`;

  it("takes an address only as a request sends it", () => {
    expect(isCanonicalUrl(`${DECKS}a.ttl`)).toBe(true);
    expect(canonicalUrlOf("HTTPS://POD.example:443/a/./b/../c")).toBe("https://pod.example/a/c");
    expect(canonicalUrlOf("not an address")).toBeNull();
    expect(isCanonicalUrl("not an address")).toBe(false);
    expect(isPlainHttpUrl(ROOT)).toBe(true);
    expect(isPlainHttpUrl("http://pod.example/a")).toBe(true);
    // Another spelling of an http(s) address is one.
    expect(isPlainHttpUrl("https://Pod.example/kortlekar-å/")).toBe(true);
    for (const url of [`${ROOT}?x`, `${ROOT}#x`, "urn:x:a", "file:///a/", "not an address"]) {
      expect(isPlainHttpUrl(url), url).toBe(false);
    }
    expect(isSameUrl("https://Pod.example:443/a/./å", "https://pod.example/a/%C3%A5")).toBe(true);
    expect(isSameUrl("https://pod.example/a", "https://pod.example/b")).toBe(false);
    expect(isSameUrl("not an address", "not an address")).toBe(false);
  });

  it("takes an instance's address as the user types it, as a request sends it", () => {
    expect(instanceAddressOf("https://Pod.example/a/../kortlekar-å")).toBe(
      "https://pod.example/kortlekar-%C3%A5/",
    );
    expect(instanceAddressOf("not an address")).toBe("not an address/");
  });

  it("takes a registration's address as written, unless a dot segment makes it another folder", () => {
    for (const url of [
      ROOT,
      "https://Pod.example/kortlekar-å/",
      "https://pod.example/한국어/",
      "https://bücher.example/a/",
      "https://pod.example/a.b/..c/",
    ]) {
      expect(isInstanceAddress(url), url).toBe(true);
    }
    for (const url of [
      "https://pod.example/a/../",
      "https://pod.example/a/..",
      "https://pod.example/a/./b/",
      "https://pod.example/a/%2e%2E/",
      "https://pod.example/a/.%2e/",
      "https://pod.example/a\\..\\b/",
      "https://pod.example/a/.\t./",
      `${ROOT}?x`,
      "urn:x:a",
    ]) {
      expect(isInstanceAddress(url), url).toBe(false);
    }
    expect(hasDotSegment("https://pod.example/a/..?x")).toBe(true);
    expect(hasDotSegment("https://pod.example/a.ttl")).toBe(false);
  });

  it("is a document in the folder, or in one of its folders", () => {
    expect(isDocumentIn(`${DECKS}deck-1.ttl`, DECKS)).toBe(true);
    expect(isDocumentIn(`${DECKS}deck-1-5f0c.ttl`, DECKS)).toBe(true);
    expect(isDocumentIn(`${DECKS}old/deck-1.ttl`, DECKS)).toBe(true);
    // The folder's address without its slash names the same folder.
    expect(isDocumentIn(`${DECKS}deck-1.ttl`, DECKS.slice(0, -1))).toBe(true);
    // Another spelling of the folder or the document is that folder or document, as fetched.
    for (const [url, container] of [
      ["https://Pod.example:443/solid-memo/main/decks/deck-1.ttl", DECKS],
      ["HTTPS://pod.example/solid-memo/main/decks/deck-1.ttl", DECKS],
      [`${DECKS}./deck-1.ttl`, DECKS],
      [`${DECKS}x/%2e/y.ttl`, DECKS],
      [
        "https://pod.example/kortlekar-å/decks/deck-1.ttl",
        "https://pod.example/kortlekar-%C3%A5/decks/",
      ],
      ["https://pod.example/한국어/decks/deck-1.ttl", "https://pod.example/한국어/decks/"],
      ["https://bücher.example/d/x.ttl", "https://xn--bcher-kva.example/d/"],
      ["https://xn--bcher-kva.example/d/x.ttl", "https://bücher.example/d/"],
    ]) {
      expect(isDocumentIn(url!, container!), url).toBe(true);
    }
  });

  it("is in a folder as the folder itself, a folder in it or a document in it", () => {
    const instance = "https://pod.example/solid-memo/main/";
    for (const url of [instance, `${instance}history/`, `${instance}decks/deck-1.ttl`]) {
      expect(isInFolder(url, instance), url).toBe(true);
    }
    expect(isInFolder("https://Pod.example/solid-memo/main", instance)).toBe(false);
    for (const url of [
      "https://pod.example/solid-memo/",
      "https://pod.example/solid-memo/main-2/x.ttl",
      `${instance}a%2F..%2F..%2Fx.ttl`,
      `${instance}.acl`,
      `${instance}history//x.ttl`,
      "https://pod.example.attacker.example/solid-memo/main/x.ttl",
      "not a url",
    ]) {
      expect(isInFolder(url, instance), url).toBe(false);
    }
  });

  it("is never an address a request would resolve elsewhere, nor one a server might", () => {
    for (const url of [
      // Dot segments, plain, encoded and mixed, in any case.
      `${DECKS}../../../profile/card`,
      `${DECKS}%2e%2e/%2e%2e/private/diary.ttl`,
      `${DECKS}%2E%2E/x.ttl`,
      `${DECKS}.%2E/x.ttl`,
      `${DECKS}%2e./x.ttl`,
      `https://pod.example/kortlekar-å/decks/../../alice/x.ttl`,
      // Encoded slashes and backslashes, which some servers decode.
      `${DECKS}..%2f..%2fprofile/card`,
      `${DECKS}..%2F..%2Fprofile/card`,
      `${DECKS}..%5c..%5cprofile`,
      `${DECKS}..\\..\\profile`,
      // What only some servers read as a step out: a path parameter, a double encoding, an
      // overlong UTF-8 dot, an IIS escape, a segment that begins with a dot, a NUL.
      `${DECKS}..;/..;/profile/card`,
      `${DECKS}..%3b/x.ttl`,
      `${DECKS}%252e%252e/%252e%252e/x.ttl`,
      `${DECKS}%c0%ae%c0%ae/x.ttl`,
      `${DECKS}%C1%9C/x.ttl`,
      `${DECKS}%u002e%u002e/x.ttl`,
      `${DECKS}.../x.ttl`,
      `${DECKS}..%09/x.ttl`,
      `${DECKS}..%20/x.ttl`,
      `${DECKS}%2e%2e%00/x.ttl`,
      `${DECKS}x.ttl%00`,
      `${DECKS}.hidden`,
      `${DECKS}x;y.ttl`,
      // An empty segment, which a client may merge into one slash before it sends the request.
      `${DECKS}/deck-1.ttl`,
      `${DECKS}old//deck-1.ttl`,
      // Another host: a trailing dot, userinfo, another name.
      "https://pod.example./solid-memo/main/decks/deck-1.ttl",
      "https://user@pod.example/solid-memo/main/decks/deck-1.ttl",
      "https://bücher.example/solid-memo/main/decks/deck-1.ttl",
      // A folder, the folder itself, a part of a document, a query.
      `${DECKS}old/`,
      DECKS,
      `${DECKS}deck-1.ttl#card-1`,
      `${DECKS}deck-1.ttl?x`,
      // Beside the folder, and in a folder whose name begins as its does.
      `${ROOT}catalog.ttl`,
      `${ROOT}decks-other/deck-1.ttl`,
      "https://pod.example/solid-memo/main/decks",
      "not an address",
      "decks/deck-1.ttl",
    ]) {
      expect(isDocumentIn(url, DECKS), url).toBe(false);
    }
    expect(isDocumentIn(`${DECKS}x.ttl`, "not an address")).toBe(false);
  });

  it("reads a deck's documents wherever its entry names them, its entry in the instance's catalog", () => {
    const deck = {
      url: `${ROOT}catalog.ttl#deck-1`,
      cardsDocumentUrl: `${DECKS}deck-1.ttl`,
      reviewsDocumentUrl: `${ROOT}reviews/deck-1.ttl`,
    };
    expect(isDeckInPlace(deck)).toBe(true);
    for (const placed of [
      // As an earlier version's library upgrade left them.
      {
        cardsDocumentUrl: `${DECKS}deck-1-0b6e.ttl`,
        reviewsDocumentUrl: `${ROOT}reviews/deck-1-0b6e.ttl`,
      },
      // Renamed folders, a folder below, free names, another folder of the pod, a flat pod.
      {
        cardsDocumentUrl: `${ROOT}kort/spanska.ttl`,
        reviewsDocumentUrl: `${ROOT}answers/spanska.ttl`,
      },
      { cardsDocumentUrl: `${DECKS}old/deck-1.ttl` },
      { cardsDocumentUrl: `${DECKS}deck%201.ttl`, reviewsDocumentUrl: `${DECKS}deck-1.TTL` },
      {
        cardsDocumentUrl: "https://pod.example/spanish-cards",
        reviewsDocumentUrl: "https://pod.example/spanish-reviews",
      },
    ]) {
      expect(isDeckInPlace({ ...deck, ...placed }), JSON.stringify(placed)).toBe(true);
    }
    expect(
      isDeckInPlace({
        url: "https://pod.example/catalog.ttl#deck-1",
        cardsDocumentUrl: "https://pod.example/cards.ttl",
        reviewsDocumentUrl: "https://pod.example/reviews.ttl",
      }),
    ).toBe(true);
    for (const misplaced of [
      { reviewsDocumentUrl: `${ROOT}reviews/../../../x.ttl` },
      { cardsDocumentUrl: `${DECKS}./deck-1.ttl` },
      // The instance's own documents.
      { cardsDocumentUrl: `${ROOT}meta.ttl` },
      { cardsDocumentUrl: `${ROOT}catalog.ttl` },
      { reviewsDocumentUrl: `${ROOT}preferences.ttl` },
      { cardsDocumentUrl: `${ROOT}palettes.ttl` },
      { reviewsDocumentUrl: "https://Pod.example/solid-memo/main/digest.ttl" },
      { reviewsDocumentUrl: `${ROOT}history/2026-10.ttl` },
      { cardsDocumentUrl: `${ROOT}drafts/spanish/v1/cards.ttl` },
      { cardsDocumentUrl: `${ROOT}releases/spanish/v1.ttl` },
      { url: `${ROOT}other.ttl#deck-1` },
      { url: "not an address#deck-1" },
      // Another document's access control or metadata, which a write would replace.
      { cardsDocumentUrl: `${DECKS}deck-1.ttl.acl` },
      { cardsDocumentUrl: `${DECKS}deck-1.ttl.ACL` },
      { cardsDocumentUrl: `${DECKS}deck-1.ttl.acr` },
      { cardsDocumentUrl: `${DECKS}deck-1.ttl.meta` },
      { reviewsDocumentUrl: `${ROOT}reviews/deck-1.ttl.acl` },
      // An empty segment (one document spelled two ways), a folder, a hidden name.
      { cardsDocumentUrl: `${DECKS}/deck-1.ttl` },
      { reviewsDocumentUrl: `${ROOT}reviews//deck-1.ttl` },
      { cardsDocumentUrl: `${DECKS}` },
      { cardsDocumentUrl: `${DECKS}.ttl` },
    ]) {
      expect(isDeckInPlace({ ...deck, ...misplaced }), JSON.stringify(misplaced)).toBe(false);
    }
    // An instance whose address is spelled otherwise than a request sends it.
    for (const instance of [
      "https://pod.example/kortlekar-å/",
      "https://pod.example/kortlekar-%C3%A5/",
      "https://Pod.Example/a/",
      "https://bücher.example/a/",
    ]) {
      expect(
        isDeckInPlace({
          url: `${instance}catalog.ttl#deck-1`,
          cardsDocumentUrl: `${instance}decks/deck-1.ttl`,
          reviewsDocumentUrl: `${instance}reviews/deck-1.ttl`,
        }),
        instance,
      ).toBe(true);
    }
  });

  it("lets a write go only to an address in canonical form a server cannot read as another resource", () => {
    for (const url of [
      `${DECKS}deck-1.ttl`,
      DECKS,
      "https://pod.example/",
      "https://pod.example/profile/card",
      "https://pod.example/caf%C3%A9/x.ttl",
    ]) {
      expect(isSafeWriteUrl(url), url).toBe(true);
    }
    for (const url of [
      `${DECKS}../../../profile/card`,
      `${DECKS}%2e%2e/%2e%2e/private/diary.ttl`,
      `${DECKS}..%2f..%2fprofile/card`,
      `${DECKS}..%5c..%5cprofile`,
      `${DECKS}..;/profile/card`,
      `${DECKS}%252e%252e/x.ttl`,
      `${DECKS}%c0%ae%c0%ae/x.ttl`,
      `${DECKS}%u002e%u002e/x.ttl`,
      `${DECKS}x.ttl%00`,
      `${DECKS}.hidden`,
      `${DECKS}old//deck-1.ttl`,
      `${DECKS}deck-1.ttl?x`,
      `${DECKS}deck-1.ttl#card-1`,
      `${DECKS}deck-1.ttl.acl`,
      `${DECKS}deck-1.ttl.ACR`,
      `${DECKS}deck-1.ttl.Meta`,
      `${DECKS}.acl`,
      `${DECKS}deck-1.ttl.ac%6C`,
      `${DECKS}%7Edeck.ttl`,
      `${DECKS}deck%2D1.ttl`,
      "https://POD.example/x.ttl",
      "https://pod.example:443/x.ttl",
      "ftp://pod.example/x.ttl",
      "not an address",
      "decks/deck-1.ttl",
    ]) {
      expect(isSafeWriteUrl(url), url).toBe(false);
    }
  });

  it("reads a document only at an address a request leaves where it names", () => {
    expect(isSafeDocumentUrl(`${DECKS}deck-1.ttl`)).toBe(true);
    expect(isSafeDocumentUrl("https://pod.example/x")).toBe(true);
    for (const url of [
      `${DECKS}../../../profile/card`,
      `${DECKS}%2e%2e/%2e%2e/private/diary.ttl`,
      `${DECKS}..%2f..%2fprofile/card`,
      `${DECKS}..%5c..%5cprofile`,
      `${DECKS}..;/profile/card`,
      `${DECKS}%252e%252e/x.ttl`,
      `${DECKS}%c0%ae%c0%ae/x.ttl`,
      `${DECKS}%u002e%u002e/x.ttl`,
      `${DECKS}x.ttl%00`,
      `${DECKS}.hidden`,
      `${DECKS}old//deck-1.ttl`,
      `${DECKS}deck-1.ttl?x`,
      `${DECKS}deck-1.ttl#card-1`,
      `${DECKS}deck-1.ttl.acl`,
      `${DECKS}deck-1.ttl.Meta`,
      DECKS,
      "https://pod.example/",
      "ftp://pod.example/x.ttl",
      "not an address",
      "decks/deck-1.ttl",
    ]) {
      expect(isSafeDocumentUrl(url), url).toBe(false);
    }
  });

  it("owns a document that names the deck's entry, spelled any way a request sends it", () => {
    const deck = `${ROOT}catalog.ttl#deck-1`;
    expect(ownsDocument([deck], deck)).toBe(true);
    expect(ownsDocument(["https://Pod.example:443/solid-memo/main/catalog.ttl#deck-1"], deck)).toBe(
      true,
    );
    expect(ownsDocument([`${ROOT}catalog.ttl#deck-2`, deck], deck)).toBe(true);
    expect(ownsDocument([], deck)).toBe(false);
    expect(ownsDocument(["https://pod.example/other/catalog.ttl#deck-1"], deck)).toBe(false);
  });
});
