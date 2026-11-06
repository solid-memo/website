// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createContext, type ComponentChildren } from "preact";
import { useContext, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { pictureHost } from "@solid-memo/domain/deckPictures";
import { libraryCopyTest } from "@solid-memo/domain/libraryCopy";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import { libraryIndexQuery } from "./deckTreeEditor";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type ErrorText } from "./i18n";
import { queryKeys } from "./queryKeys";
import { useRemembered } from "./remembered";

/**
 * What may be done with a picture on the deck's cards: load it; wait, for
 * the library's index is still read; or ask the learner about its host.
 */
export type PictureAccess = "show" | "wait" | { host: string };

/** How the deck's cards below a DeckPictures treat pictures, when it is a deck that asks. */
export interface PictureGate {
  access: (url: string) => PictureAccess;
  /** Show the deck's pictures from this host, from now on. */
  allow: (host: string) => void;
  /** A host is being saved. */
  busy: boolean;
  /** Why the last host could not be saved. */
  error: ErrorText | null;
}

/** The deck's gate; null for pictures that load as they are, which is all but a linked deck's. */
const PicturesContext = createContext<PictureGate | null>(null);

/**
 * Whether a deck's catalog is in the learner's own pod; undefined while
 * that is read, or for no deck. A read that fails leaves the last answer,
 * so a passing network failure does not turn an own deck into one that
 * asks; with no answer yet, it is not taken for the learner's own.
 */
export function useInOwnPod(useCases: UseCases, deck: Deck | undefined): boolean | undefined {
  const catalogUrl = deck === undefined ? null : documentUrlOf(deck.url);
  const query = useQuery({
    queryKey: queryKeys.inOwnPod(catalogUrl),
    queryFn: () => useCases.isInOwnPod(catalogUrl!),
    enabled: catalogUrl !== null,
  });
  return query.data ?? (query.isError ? false : undefined);
}

/**
 * Choices kept only for the life of the page, as `${where} ${host}`, for
 * a deck or a draft with no place to keep one that could be believed.
 * A reload takes them all back.
 */
function usePageChoices(): {
  has: (where: string, host: string) => boolean;
  add: (where: string, host: string) => void;
} {
  const [choices, setChoices] = useRemembered<ReadonlySet<string>>(
    "deckPictures:thisPage",
    new Set(),
  );
  return {
    has: (where, host) => choices.has(`${where} ${host}`),
    add: (where, host) => setChoices((before) => new Set(before).add(`${where} ${host}`)),
  };
}

/**
 * The screens below it show the cards of `deck`, and hold its pictures to
 * the learner's choice (docs/privacy.md) when it is a copy of a release
 * outside the library's index, or in an instance outside the learner's
 * pod: a picture's host is asked of the learner for the deck, and until
 * then nothing is requested from it. The learner's own decks and the
 * library's copies load theirs as ever, and so does anything under no
 * DeckPictures, such as the library's own screens. While the deck's place
 * is read, nothing loads; while the index is read, only the hosts already
 * chosen. An index that cannot be read leaves the copy asking, the safe way.
 *
 * In the learner's pod a choice is on the deck's entry, and read with the
 * deck. It is kept here too, so a screen whose deck was read earlier (a
 * cram's) shows the picture at once. Outside it, whoever writes the
 * catalog writes that term and what it says of the deck, so neither is
 * believed: every such deck asks, and a choice lasts for the page.
 */
export function DeckPictures({
  useCases,
  deck,
  children,
}: {
  useCases: UseCases;
  deck: Deck | undefined;
  children: ComponentChildren;
}) {
  const { errorText } = useI18n();
  const queryClient = useQueryClient();
  const inOwnPod = useInOwnPod(useCases, deck);
  const copy = inOwnPod === true && deck?.sourceUrl !== undefined;
  const libraryQuery = useQuery({ ...libraryIndexQuery(useCases), enabled: copy });
  const library = libraryQuery.data;
  const isLibraryCopy = useMemo(
    () => (library === undefined ? undefined : libraryCopyTest(library)),
    [library],
  );
  const chosen = useMemo(() => new Set(deck?.pictureHosts), [deck?.pictureHosts]);
  const pageChoices = usePageChoices();
  // By deck too, as a cram of every deck's leeches goes from deck to deck under one DeckPictures.
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  const savedName = (host: string) => `${deck!.url} ${host}`;
  const allowMutation = useMutation({
    mutationFn: (host: string) => useCases.setDeckPictureHost(deck!, host, true),
    onSuccess: (_, host) => {
      setSaved((before) => new Set(before).add(savedName(host)));
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.allDecks() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.allCardProgress() }),
      ]);
    },
  });
  const unread = copy && isLibraryCopy === undefined && !libraryQuery.isError;
  const asks =
    deck !== undefined && (inOwnPod !== true || (copy && isLibraryCopy?.(deck) !== true));
  const shown = (host: string) =>
    inOwnPod === true
      ? chosen.has(host) || saved.has(savedName(host))
      : pageChoices.has(deck!.url, host);
  const gate: PictureGate | null = asks
    ? {
        access: (url) => {
          const host = pictureHost(url);
          if (host === null) return "show";
          if (inOwnPod === undefined) return "wait";
          if (shown(host)) return "show";
          return unread ? "wait" : { host };
        },
        allow: (host) => {
          if (inOwnPod === true) allowMutation.mutate(host);
          else pageChoices.add(deck!.url, host);
        },
        busy: allowMutation.isPending,
        error: errorText(allowMutation.error),
      }
    : null;
  return <PicturesContext.Provider value={gate}>{children}</PicturesContext.Provider>;
}

/**
 * The screens below it preview a draft of a release, whose pictures may
 * be another's: a draft can be made from a linked deck or release, and
 * nothing in it says so afterward (deckToDraft leaves that behind). So
 * every draft asks about a picture's host, as a linked deck does, and a
 * choice lasts for the page: a draft is published as it is written, so
 * none is kept in it.
 */
export function DraftPictures({
  draftUrl,
  children,
}: {
  draftUrl: string;
  children: ComponentChildren;
}) {
  const pageChoices = usePageChoices();
  const gate: PictureGate = {
    access: (url) => {
      const host = pictureHost(url);
      return host === null || pageChoices.has(draftUrl, host) ? "show" : { host };
    },
    allow: (host) => pageChoices.add(draftUrl, host),
    busy: false,
    error: null,
  };
  return <PicturesContext.Provider value={gate}>{children}</PicturesContext.Provider>;
}

/** The gate of the deck whose cards are shown here; null when its pictures just load. */
export function usePictureGate(): PictureGate | null {
  return useContext(PicturesContext);
}

/** What may be done with this picture here. */
export function usePictureAccess(url: string): PictureAccess {
  const gate = usePictureGate();
  return gate === null ? "show" : gate.access(url);
}

/**
 * Whether a side still to come is to be on the page already, out of
 * sight, for a deck that asks: its picture is then requested with the rest
 * of the card and not at the moment the learner reveals it, so the
 * request says nothing of when they did. An element, as a browser may
 * request anew an address it was told not to keep. Only a picture the
 * learner chose to show; anything else stays as it is.
 */
export function useLoadsAhead(url: string | undefined): boolean {
  const gate = usePictureGate();
  return gate !== null && url !== undefined && gate.access(url) === "show";
}

/** The button that shows the deck's pictures from a host, with why that failed if it did. */
export function ShowPictures({
  gate,
  host,
  asked,
  onAsk,
}: {
  gate: PictureGate;
  host: string;
  /** This button was the one pressed, so a failure is its to tell. */
  asked: boolean;
  onAsk: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {/* Only aria-disabled while it saves, so it keeps the focus if saving fails. */}
      <button
        type="button"
        aria-disabled={gate.busy}
        onClick={() => {
          if (gate.busy) return;
          onAsk();
          gate.allow(host);
        }}
      >
        {t("cardFace.showPictures", { host })}
      </button>
      {asked && <ErrorMessage error={gate.error} />}
    </>
  );
}

/**
 * Above a list of the deck's cards, whose pictures sit in links and rows
 * too small for a choice: which hosts' pictures are hidden on the cards
 * shown, each with the choice. Once chosen, the button goes away, and a
 * line saying so takes the focus. Nothing for a deck that does not ask.
 */
export function HiddenPicturesNotice({ urls }: { urls: readonly (string | undefined)[] }) {
  const { t } = useI18n();
  const gate = usePictureGate();
  const [asked, setAsked] = useState<string | null>(null);
  const hidden = new Set<string>();
  if (gate !== null) {
    for (const url of urls) {
      const access = url === undefined ? "show" : gate.access(url);
      if (typeof access === "object") hidden.add(access.host);
    }
  }
  const shown = asked !== null && !hidden.has(asked) ? asked : null;
  const shownRef = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    if (shown !== null) shownRef.current!.focus();
  }, [shown]);
  return (
    <>
      {shown !== null && (
        <p ref={shownRef} class="hint" tabIndex={-1}>
          {t("cardFace.picturesShown", { host: shown })}
        </p>
      )}
      {[...hidden].map((host) => (
        <div key={host} class="card-pictures-hidden">
          <p class="hint">{t("cardFace.picturesHidden", { host })}</p>
          <ShowPictures
            gate={gate!}
            host={host}
            asked={asked === host}
            onAsk={() => setAsked(host)}
          />
        </div>
      ))}
    </>
  );
}
