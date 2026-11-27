// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useState } from "preact/hooks";
import type { UseCases } from "@solid-memo/application/useCases";
import type { UnclaimedDeck } from "@solid-memo/domain/validation";
import { bounded } from "./bounded";
import { ErrorMessage } from "./ErrorMessage";
import { ExternalLink } from "./ExternalLink";
import { useI18n } from "./i18n";
import { ReaderText } from "./ReaderText";
import { queryKeys } from "./queryKeys";
import { changes, useWrite } from "./writeEffects";

/**
 * The decks whose documents do not say they are the decks' own, outside
 * the instance's own folder (the check's `unclaimed`, docs/data-model.md
 * "Where an instance's documents are"): each with its documents'
 * addresses and "These are this deck's documents", which asks once more,
 * then marks those addresses, and no others, as the deck's
 * (UseCases.claimDeckDocuments) and reads every check of the instance
 * afresh, whether it did or the deck names others by then. A deck with
 * documents that may not be claimed (`outsidePod`) has no such button,
 * and says which and why.
 * Nothing when there are none. Solid Memo shows it with the data check,
 * above every screen of the instance; the Studio, on its Health screen.
 * So it lists the first LIST_LIMIT decks (bounded), each with its
 * documents, at most two, and says how many more there are.
 */
export function UnclaimedDecksNotice({
  useCases,
  instanceUrl,
  decks,
}: {
  useCases: UseCases;
  instanceUrl: string;
  decks: readonly UnclaimedDeck[];
}) {
  const { t, tx, errorText } = useI18n();
  const [confirming, setConfirming] = useState<string | null>(null);
  const claim = useWrite({
    // The question goes as soon as the claim is written, while the instance is checked again.
    // Only the addresses the user was shown and confirmed are claimed, never what the catalog names by then.
    mutationFn: async (deck: UnclaimedDeck) => {
      await useCases.claimDeckDocuments(instanceUrl, deck.deckUrl, deck.documents);
      setConfirming(null);
    },
    changes: () => [changes.reads(queryKeys.validation(instanceUrl))],
  });
  if (decks.length === 0) return null;
  const { shown, more } = bounded(decks);
  return (
    <div class="warning data-check" role="region" aria-label={t("unclaimedDecks.region")}>
      <p>
        <strong>{t("unclaimedDecks.heading")}</strong> {t("unclaimedDecks.hint")}
      </p>
      <ul>
        {shown.map((deck) => (
          <li key={deck.deckUrl}>
            {tx("unclaimedDecks.deck", { deck: <ReaderText text={deck.title} /> })}
            <ul class="unclaimed-documents">
              {deck.documents.map((url) => (
                <li key={url}>
                  <ExternalLink url={url} dir="ltr" />
                </li>
              ))}
            </ul>
            {deck.outsidePod.length > 0 ? (
              <p class="unclaimed-addresses">
                {t("unclaimedDecks.outsidePod")} {deck.outsidePod.join(", ")}
              </p>
            ) : confirming === deck.deckUrl ? (
              <p class="unclaimed-addresses">
                {tx("unclaimedDecks.confirm", { deck: <ReaderText text={deck.title} /> })}{" "}
                {deck.documents.join(", ")}{" "}
                <button
                  class="primary"
                  onClick={() => claim.mutate(deck)}
                  disabled={claim.isPending}
                >
                  {claim.isPending
                    ? t("unclaimedDecks.claiming")
                    : t("unclaimedDecks.confirmButton")}
                </button>{" "}
                <button onClick={() => setConfirming(null)} disabled={claim.isPending}>
                  {t("unclaimedDecks.cancel")}
                </button>
              </p>
            ) : (
              <button
                onClick={() => {
                  claim.reset();
                  setConfirming(deck.deckUrl);
                }}
              >
                {t("unclaimedDecks.claim")}
              </button>
            )}
          </li>
        ))}
      </ul>
      {more > 0 && <p class="hint">{t("common.moreDecks", { count: more })}</p>}
      <ErrorMessage error={errorText(claim.error)} />
    </div>
  );
}
