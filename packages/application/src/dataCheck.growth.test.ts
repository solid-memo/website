// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The check of an instance whose many decks name one cards document and
 * one reviews document takes time that grows with the decks and the
 * documents, not their product: each document is checked once, and
 * asked once whether it is a deck's, however many decks name it
 * (instanceChecks.ts onceEach). Here a document's report holds a problem
 * with each of its subjects, and the ask goes over every deck naming it,
 * as the repository's does. Eight times as many decks over documents of
 * eight times as many subjects must take less than four times as long
 * as an eighth of them done eight times over (testing.md). So must
 * decks that each spell the documents' addresses their own way: each
 * document is still reported once, the other spellings named of it
 * (ValidationReport.spellings).
 */
import { expect, it, vi } from "vitest";
import type { Deck } from "@solid-memo/domain/deck";
import { emptyDigest } from "@solid-memo/domain/studyDigest";
import { growthAsync } from "@solid-memo/domain/testing/growth";
import type { DocumentReport } from "@solid-memo/domain/validation";
import { deckSetAside } from "@solid-memo/domain/validation";
import { createInstanceCheckUseCases } from "./instanceChecks";
import { deck, instance, makeDeps } from "./testing/fakePorts";

const CARDS = `${instance.url}shared-cards.ttl`;
const REVIEWS = `${instance.url}shared-reviews.ttl`;

it("checks many decks naming one cards and one reviews document in time that grows with them, not their product", async () => {
  const ratio = await growthAsync(
    (count) => {
      const decks = Array.from(
        { length: count },
        (_, at): Deck => ({
          ...deck,
          id: `deck-${at}`,
          url: `${instance.url}catalog.ttl#deck-${at}`,
          cardsDocumentUrl: CARDS,
          reviewsDocumentUrl: REVIEWS,
        }),
      );
      const subjects = Array.from({ length: count }, (_, at) => ({
        url: `${CARDS}#c${at}`,
        status: "checked" as const,
        shape: "card" as const,
        version: 1,
        violations: [
          { severity: "violation" as const, message: { en: "No." }, constraint: "MinCount" },
        ],
      }));
      const deps = makeDeps();
      vi.mocked(deps.deckRepository.listDecks).mockResolvedValue(decks);
      vi.mocked(deps.deckRepository.unclaimedDocuments).mockResolvedValue([]);
      // Over every deck naming it, as the repository's ask (deckPlace.ts unclaimedForAll) goes.
      deps.deckRepository.isUnclaimedAsRead = async (naming) =>
        !naming.some((one) => one.url === instance.url);
      vi.mocked(deps.shapeValidator.validateDocumentSince).mockImplementation(async (url) => ({
        unchanged: false,
        version: null,
        value: (url === CARDS || url === REVIEWS
          ? { url, status: "checked", subjects }
          : { url, status: "checked", subjects: [] }) satisfies DocumentReport,
      }));
      const checks = createInstanceCheckUseCases({
        ...deps,
        answerStore: { logMonths: async () => [] },
        digestStore: {
          of: async () => emptyDigest(),
          remember: () => undefined,
          isInstances: async () => true,
        },
        webId: () => undefined,
        ruleset: "rules",
      });
      return async () => {
        const report = await checks.checkInstance(instance.url);
        expect(report.conforms).toBe(true);
      };
    },
    400,
    8,
    4,
  );
  expect(ratio).toBeLessThan(4);
}, 180_000);

/** The address `url` spelled the `at`th way: the host's letters upper case as the bits of `at` say. */
function spelling(url: string, at: number): string {
  const { host } = new URL(url);
  let bit = 0;
  const spelled = [...host]
    .map((letter) =>
      /[a-z]/.test(letter) && (at >> bit++) % 2 === 1 ? letter.toUpperCase() : letter,
    )
    .join("");
  return url.replace(host, spelled);
}

it("checks many decks each spelling one cards and one reviews document its own way in time that grows with them, not their product", async () => {
  const ratio = await growthAsync(
    (count) => {
      const decks = Array.from(
        { length: count },
        (_, at): Deck => ({
          ...deck,
          id: `deck-${at}`,
          url: `${instance.url}catalog.ttl#deck-${at}`,
          cardsDocumentUrl: spelling(CARDS, at),
          reviewsDocumentUrl: spelling(REVIEWS, at),
        }),
      );
      const subjects = Array.from({ length: count }, (_, at) => ({
        url: `${CARDS}#c${at}`,
        status: "checked" as const,
        shape: "card" as const,
        version: 1,
        violations: [
          { severity: "violation" as const, message: { en: "No." }, constraint: "MinCount" },
        ],
      }));
      const deps = makeDeps();
      vi.mocked(deps.deckRepository.listDecks).mockResolvedValue(decks);
      vi.mocked(deps.deckRepository.unclaimedDocuments).mockResolvedValue([]);
      deps.deckRepository.isUnclaimedAsRead = async () => false;
      vi.mocked(deps.shapeValidator.validateDocumentSince).mockImplementation(async (url) => ({
        unchanged: false,
        version: null,
        value: (decks.some((one) => one.cardsDocumentUrl === url || one.reviewsDocumentUrl === url)
          ? { url, status: "checked", subjects }
          : { url, status: "checked", subjects: [] }) satisfies DocumentReport,
      }));
      const checks = createInstanceCheckUseCases({
        ...deps,
        answerStore: { logMonths: async () => [] },
        digestStore: {
          of: async () => emptyDigest(),
          remember: () => undefined,
          isInstances: async () => false,
        },
        webId: () => undefined,
        ruleset: "rules",
      });
      return async () => {
        const report = await checks.checkInstance(instance.url);
        expect(report.violationCount).toBe(2 * count);
        expect(decks.every((one) => deckSetAside(report, one))).toBe(true);
      };
    },
    200,
    8,
    4,
  );
  expect(ratio).toBeLessThan(4);
}, 180_000);
