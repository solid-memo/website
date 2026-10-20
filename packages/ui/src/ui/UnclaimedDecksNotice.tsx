// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useState } from "preact/hooks";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { UnclaimedDeck } from "@solid-memo/domain/validation";
import { ErrorMessage } from "./ErrorMessage";
import { ExternalLink } from "./ExternalLink";
import { useI18n } from "./i18n";
import { ReaderText } from "./ReaderText";

/**
 * The decks whose documents do not say they are the decks' own, outside
 * the instance's own folder (the check's `unclaimed`, docs/data-model.md
 * "Where an instance's documents are"): each with its documents'
 * addresses and "These are this deck's documents", which asks once more,
 * then marks them as the deck's (UseCases.claimDeckDocuments) and reads
 * every check of the instance afresh. Nothing when there are none.
 * Solid Memo shows it with the data check; the Studio, on its Health
 * screen.
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
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<string | null>(null);
  const claim = useMutation({
    mutationFn: (deckUrl: string) => useCases.claimDeckDocuments(instanceUrl, deckUrl),
    onSuccess: async () => {
      setConfirming(null);
      await queryClient.invalidateQueries({ queryKey: ["validation", instanceUrl] });
    },
  });
  if (decks.length === 0) return null;
  return (
    <div class="warning data-check" role="region" aria-label={t("unclaimedDecks.region")}>
      <p>
        <strong>{t("unclaimedDecks.heading")}</strong> {t("unclaimedDecks.hint")}
      </p>
      <ul>
        {decks.map((deck) => (
          <li key={deck.deckUrl}>
            {tx("unclaimedDecks.deck", { deck: <ReaderText text={deck.title} /> })}
            <ul class="unclaimed-documents">
              {deck.documents.map((url) => (
                <li key={url}>
                  <ExternalLink url={url} dir="ltr" />
                </li>
              ))}
            </ul>
            {confirming === deck.deckUrl ? (
              <p>
                {tx("unclaimedDecks.confirm", { deck: <ReaderText text={deck.title} /> })}{" "}
                {deck.documents.join(", ")}{" "}
                <button
                  class="primary"
                  onClick={() => claim.mutate(deck.deckUrl)}
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
      <ErrorMessage error={errorText(claim.error)} />
    </div>
  );
}
