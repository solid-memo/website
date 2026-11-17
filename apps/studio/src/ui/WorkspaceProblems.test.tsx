// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { DeckHealth } from "@solid-memo/domain/deckHealth";
import { problem } from "@solid-memo/domain/release/problems";
import { createI18n } from "@solid-memo/ui/i18n";
import type { MarkdownProblem } from "@solid-memo/ui/MarkdownEditing";
import { courseDraft, instanceA, invalidReport, makeCard, makeDeck } from "../test/fixtures";
import { PROBLEM_LIMIT } from "./ProblemList";
import { queryKeys } from "./queryKeys";
import { deckProblemsOf, useWorkspaceProblems } from "./WorkspaceProblems";

const en = createI18n("en");
const kanji = makeDeck("deck-1", { en: "Kanji N5" });
const water = makeCard(kanji, "water");
const fire = makeCard(kanji, "fire");

const health = (part: Partial<DeckHealth<MarkdownProblem>>): DeckHealth<MarkdownProblem> => ({
  report: { ...invalidReport([]), violationCount: 0 },
  unstated: [],
  duplicates: [],
  markdown: [],
  markdownMore: 0,
  ...part,
});

describe("deckProblemsOf", () => {
  it("lists the deck's data in one line at its health, then each spot at its field", () => {
    const found = deckProblemsOf(
      kanji,
      health({
        report: invalidReport([kanji]),
        unstated: [{ card: water, place: { tab: "content", part: "front" } }],
        duplicates: [[fire, water]],
        markdown: [
          {
            card: fire,
            place: { tab: "content", part: "backNote" },
            language: "en",
            finding: { code: "tooLong", length: 9000 },
          },
        ],
      }),
      en,
    ).shown;
    expect(found.map((one) => one.text)).toEqual([
      "1 problem in the deck's data",
      "water, front: its language is not stated",
      "fire: says the same as another card",
      "fire, note under the back: Too long to read as Markdown (9,000 characters): it shows as plain text.",
    ]);
    expect(found.map((one) => one.route)).toEqual([
      { screen: "health", instanceUrl: instanceA.url, deckUrl: kanji.url },
      { screen: "card", deckUrl: kanji.url, cardUrl: water.url, tab: "content", field: "front" },
      { screen: "card", deckUrl: kanji.url, cardUrl: fire.url, tab: "content" },
      { screen: "card", deckUrl: kanji.url, cardUrl: fire.url, tab: "content", field: "backNote" },
    ]);
  });

  it("names the cards in the deck's card language first", () => {
    const swedish = { ...kanji, cardLanguage: "sv" };
    const vatten = { ...water, front: { en: "water", sv: "vatten" } };
    const found = deckProblemsOf(swedish, health({ duplicates: [[vatten, fire]] }), en).shown;
    expect(found.map((one) => one.text)).toEqual(["vatten: says the same as another card"]);
  });

  it("lists nothing of a healthy deck, nor of the languages it could not check", () => {
    expect(deckProblemsOf(kanji, health({}), en)).toEqual({ shown: [], more: 0 });
    expect(deckProblemsOf(kanji, health({ unstated: null }), en)).toEqual({ shown: [], more: 0 });
  });

  it("works out only the first PROBLEM_LIMIT, and counts the rest, those the health does not hold too", () => {
    const spot = { card: water, place: { tab: "content", part: "front" } } as const;
    const found = deckProblemsOf(
      kanji,
      health({
        report: invalidReport([kanji]),
        unstated: Array.from({ length: 30 }, () => spot),
        duplicates: Array.from({ length: 3000 }, () => [fire, water]),
        markdown: Array.from({ length: 500 }, () => ({
          ...spot,
          language: "en",
          finding: { code: "html", source: "<i>" } as const,
        })),
        markdownMore: 100_000,
      }),
      en,
    );
    expect(found.shown).toHaveLength(PROBLEM_LIMIT);
    expect(found.shown[0]!.text).toBe("1 problem in the deck's data");
    expect(found.shown.at(-1)!.text).toBe("fire: says the same as another card");
    expect(found.more).toBe(1 + 30 + 3000 + 500 + 100_000 - PROBLEM_LIMIT);
  });
});

describe("useWorkspaceProblems", () => {
  it("counts all of a draft's problems, and goes (F8) only through those the dock lists", async () => {
    const draft = courseDraft();
    const rules = (["error", "warning"] as const).flatMap((severity) =>
      Array.from({ length: 3000 }, (_, at) =>
        problem(`${draft.url}#${severity}-${at}`, { code: "noBack", params: {} }, { severity }),
      ),
    );
    const useCases = {
      checkReleaseDraft: async () => ({ rules, library: [], drops: [], markdown: [], shapes: [] }),
    } as unknown as UseCases;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () =>
        useWorkspaceProblems(
          useCases,
          { screen: "draft", draftUrl: draft.url },
          { deck: null, draft },
        ),
      {
        wrapper: ({ children }: { children?: ComponentChildren }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );
    await waitFor(() => expect(result.current.problems!.count).toBe(6000));
    expect(result.current.problems!.routes).toHaveLength(2 * PROBLEM_LIMIT);
  });

  it("counts all of a deck's problems, and goes (F8) only through those the dock lists", () => {
    const client = new QueryClient();
    const spot = { card: water, place: { tab: "content", part: "front" } } as const;
    client.setQueryData(
      queryKeys.deckHealth(instanceA.url, kanji.url, kanji.cardsDocumentUrl),
      health({ unstated: Array.from({ length: 5000 }, () => spot), markdownMore: 7 }),
    );
    const { result, rerender } = renderHook(
      () =>
        useWorkspaceProblems(
          {} as UseCases,
          { screen: "about", deckUrl: kanji.url },
          { deck: kanji, draft: null },
        ),
      {
        wrapper: ({ children }: { children?: ComponentChildren }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );
    expect(result.current.problems!.count).toBe(5007);
    const routes = result.current.problems!.routes;
    expect(routes).toHaveLength(PROBLEM_LIMIT);
    // Worked out once for each health found, not on each drawing.
    rerender();
    expect(result.current.problems!.routes).toBe(routes);
  });
});
