// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { Deck } from "./deck";
import { arrangementSetAside, deckSetAside, summarize, type DocumentReport } from "./validation";

const INSTANCE = "https://pod.example/solid-memo/a/";

describe("summarize", () => {
  it("counts violations across documents, DCAT-AP ones included, ignoring warnings, newer and untyped subjects", () => {
    const documents: DocumentReport[] = [
      { url: `${INSTANCE}meta.ttl`, status: "missing", subjects: [] },
      {
        url: `${INSTANCE}catalog.ttl`,
        status: "checked",
        subjects: [
          {
            url: `${INSTANCE}catalog.ttl#deck-1`,
            status: "checked",
            shape: "deck",
            version: 2,
            violations: [
              { message: { en: "no title" }, severity: "violation", constraint: "MinCount" },
              { message: { en: "odd" }, severity: "warning", constraint: "Pattern" },
            ],
          },
          {
            url: `${INSTANCE}catalog.ttl#deck-2`,
            status: "newer",
            shape: "deck",
            version: 3,
            latest: 2,
          },
          { url: `${INSTANCE}catalog.ttl#note`, status: "untyped" },
          {
            url: "https://creativecommons.org/publicdomain/zero/1.0/",
            status: "profiled",
            violations: [
              {
                message: { en: "class" },
                severity: "violation",
                constraint: "Class",
                profile: "dcat-ap",
              },
            ],
          },
        ],
      },
      {
        url: `${INSTANCE}decks/deck-1.ttl`,
        status: "checked",
        subjects: [
          {
            url: `${INSTANCE}decks/deck-1.ttl#se`,
            status: "checked",
            shape: "card",
            version: 2,
            violations: [
              { message: { en: "literal" }, severity: "violation", constraint: "NodeKind" },
            ],
          },
        ],
      },
    ];
    expect(summarize(INSTANCE, documents)).toEqual({
      instanceUrl: INSTANCE,
      documents,
      violationCount: 3,
      conforms: false,
    });
  });

  it("conforms when nothing is violated", () => {
    expect(summarize(INSTANCE, [])).toEqual({
      instanceUrl: INSTANCE,
      documents: [],
      violationCount: 0,
      conforms: true,
    });
  });
});

describe("what fails, and the decks set aside for it", () => {
  const report = summarize(INSTANCE, [
    {
      url: `${INSTANCE}catalog.ttl`,
      status: "checked",
      subjects: [
        {
          url: `${INSTANCE}catalog.ttl#deck-1`,
          status: "checked",
          shape: "deck",
          version: 3,
          violations: [{ message: { en: "x" }, severity: "violation", constraint: "MinCount" }],
        },
        {
          url: `${INSTANCE}catalog.ttl#deck-2`,
          status: "checked",
          shape: "deck",
          version: 3,
          violations: [{ message: { en: "x" }, severity: "warning", constraint: "MinCount" }],
        },
        { url: `${INSTANCE}catalog.ttl#note`, status: "untyped" },
      ],
    },
    {
      url: `${INSTANCE}reviews/deck-3.ttl`,
      status: "checked",
      subjects: [
        {
          url: `${INSTANCE}reviews/deck-3.ttl#a`,
          status: "profiled",
          violations: [
            {
              message: { en: "x" },
              severity: "violation",
              constraint: "Class",
              profile: "dcat-ap",
            },
          ],
        },
      ],
    },
    { url: `${INSTANCE}decks/deck-4.ttl`, status: "missing", subjects: [] },
  ]);
  const deck = (id: string): Deck => ({
    id,
    url: `${INSTANCE}catalog.ttl#${id}`,
    title: { en: id },
    cardsDocumentUrl: `${INSTANCE}decks/${id}.ttl`,
    reviewsDocumentUrl: `${INSTANCE}reviews/${id}.ttl`,
    createdAt: "",
    formatVersion: 3,
    direction: "front-to-back",
    authors: [],
  });

  it("sets aside a deck whose entry, cards or review states fail", () => {
    const cardsFail = summarize(INSTANCE, [
      {
        url: `${INSTANCE}decks/deck-4.ttl`,
        status: "checked",
        subjects: [
          {
            url: `${INSTANCE}decks/deck-4.ttl#x`,
            status: "checked",
            shape: "card",
            version: 2,
            violations: [{ message: { en: "x" }, severity: "violation", constraint: "Or" }],
          },
        ],
      },
    ]);
    const setAside = (from: typeof report, ids: string[]) =>
      ids.filter((id) => deckSetAside(from, deck(id)));
    // deck-1's entry fails, deck-2's only warns, deck-3's review states fail.
    expect(setAside(report, ["deck-1", "deck-2", "deck-3", "deck-4"])).toEqual([
      "deck-1",
      "deck-3",
    ]);
    expect(setAside(cardsFail, ["deck-4"])).toEqual(["deck-4"]);
  });

  it("walks the report once, however many decks are asked about, and again for a new report", () => {
    let walks = 0;
    const counted = (from: typeof report): typeof report => ({
      ...from,
      get documents() {
        walks += 1;
        return from.documents;
      },
    });
    const first = counted(report);
    const decks = Array.from({ length: 200 }, (_, i) => deck(`deck-${i}`));
    for (let render = 0; render < 14; render++) {
      for (const each of decks) deckSetAside(first, each);
    }
    expect(walks).toBe(1);
    expect(deckSetAside(counted(report), deck("deck-1"))).toBe(true);
    expect(walks).toBe(2);
  });
});

describe("arrangementSetAside", () => {
  const catalog = (...subjects: DocumentReport["subjects"]) =>
    summarize(INSTANCE, [{ url: `${INSTANCE}catalog.ttl`, status: "checked", subjects }]);
  const broken = [{ message: { en: "x" }, severity: "violation" as const, constraint: "MinCount" }];
  const warned = [{ message: { en: "x" }, severity: "warning" as const, constraint: "MinCount" }];

  it("is set aside when the catalog or a deck group fails", () => {
    expect(
      arrangementSetAside(
        catalog({
          url: `${INSTANCE}catalog.ttl#catalog`,
          status: "checked",
          shape: "catalog",
          version: 1,
          violations: broken,
        }),
      ),
    ).toBe(true);
    expect(
      arrangementSetAside(
        catalog({
          url: `${INSTANCE}catalog.ttl#group-1`,
          status: "checked",
          shape: "deckGroup",
          version: 1,
          violations: broken,
        }),
      ),
    ).toBe(true);
  });

  it("is not for a failing deck, a warning, or what another app wrote", () => {
    expect(
      arrangementSetAside(
        catalog({
          url: `${INSTANCE}catalog.ttl#deck-1`,
          status: "checked",
          shape: "deck",
          version: 6,
          violations: broken,
        }),
      ),
    ).toBe(false);
    expect(
      arrangementSetAside(
        catalog({
          url: `${INSTANCE}catalog.ttl#catalog`,
          status: "checked",
          shape: "catalog",
          version: 1,
          violations: warned,
        }),
      ),
    ).toBe(false);
    expect(
      arrangementSetAside(
        catalog({
          url: `${INSTANCE}catalog.ttl#theirs`,
          status: "checked",
          shape: "catalog",
          version: 1,
          violations: warned,
          foreign: true,
        }),
      ),
    ).toBe(false);
    expect(
      arrangementSetAside(
        catalog({ url: `${INSTANCE}catalog.ttl#theirs`, status: "profiled", violations: broken }),
      ),
    ).toBe(false);
  });
});
