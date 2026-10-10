import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { healthProblemCount, type CardSpot, type DeckHealth } from "@solid-memo/domain/deckHealth";
import { instanceUrlOfDeck } from "@solid-memo/domain/instanceLayout";
import type { ReleaseProblem } from "@solid-memo/domain/release/problems";
import { checkProblems, problemTarget, type ProblemTarget } from "@solid-memo/domain/release/releaseCheck";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n, type I18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { problemText, type MarkdownProblem } from "@solid-memo/ui/MarkdownEditing";
import { deckHealthQuery } from "./HealthBadge";
import { placeText } from "./HealthScreen";
import { listedProblems, ProblemList } from "./ProblemList";
import { useReleaseCheck } from "./releaseCheck";
import { isDraftRoute, spotRoute, studioRouteToHash, targetRoute, type StudioRoute } from "./router";
import type { WorkspaceProblems } from "./shell/BottomDock";

/** A deck's health as the badges and its health screen check it, with what its Markdown check finds. */
type Health = DeckHealth<MarkdownProblem>;

/**
 * The problems of the deck or the draft the route is about, for the
 * Studio's dock, its status bar and F8 (docs/studio.md, The dock), and a
 * draft's for its outline too (`draft`, as the release check lists them).
 *
 * A draft's are its release check's (useReleaseCheck, the shapes left
 * out): for a pod, or on the check, for the policy it shows. It is the
 * check the overview and the check itself make, the same query, so it
 * is made once for each version of the draft whichever shows it.
 *
 * A deck's are what its health found (deckHealthQuery), as the badges
 * and its health screen check it: read here only from what they found,
 * and checked only when the dock shows them (DeckProblems), so a deck's
 * screens make no check of their own.
 */
export function useWorkspaceProblems(
  useCases: UseCases,
  route: StudioRoute | null,
  shown: { deck: Deck | null; draft: ReleaseDraft | null },
): { problems: WorkspaceProblems | null; draft: ReleaseProblem[] | undefined } {
  const i18n = useI18n();
  const queryClient = useQueryClient();
  const draftRoute = route !== null && isDraftRoute(route) ? route : null;
  const draft = draftRoute === null ? null : shown.draft;
  const check = useReleaseCheck(useCases, draft, draftRoute?.screen === "check" ? (draftRoute.policy ?? "pod") : "pod");
  const deck = shown.deck;
  const health = useQuery<Health>({
    queryKey: deck === null ? ["validation", null] : deckHealthQuery(useCases, queryClient, instanceUrlOfDeck(deck.url), deck).queryKey,
    queryFn: skipToken,
  });

  if (draft !== null) {
    const found = check.data === undefined ? undefined : listedProblems(checkProblems(check.data));
    const targetHref = (target: ProblemTarget) => studioRouteToHash(targetRoute(draft.url, target));
    return {
      problems: {
        count: found?.length,
        routes: (found ?? []).map((problem) => targetRoute(draft.url, problemTarget(draft, problem))),
        list: <DraftProblems draft={draft} problems={found} error={check.error} targetHref={targetHref} />,
      },
      draft: found,
    };
  }
  if (deck !== null) {
    return {
      problems: {
        count: health.data === undefined ? undefined : healthProblemCount(health.data),
        routes: health.data === undefined ? [] : deckProblemsOf(deck, health.data, i18n).map((one) => one.route),
        list: <DeckProblems useCases={useCases} deck={deck} />,
      },
      draft: undefined,
    };
  }
  return { problems: null, draft: undefined };
}

/** A draft's problems in the dock: its release check's, once it is made. */
function DraftProblems({
  draft,
  problems,
  error,
  targetHref,
}: {
  draft: ReleaseDraft;
  problems: ReleaseProblem[] | undefined;
  error: unknown;
  targetHref: (target: ProblemTarget) => string;
}) {
  const { t, errorText } = useI18n();
  if (problems === undefined) return error ? <ErrorMessage error={errorText(error)} /> : <Loading label={t("studio.dock.checking")} />;
  if (problems.length === 0) return <p class="hint">{t("studio.dock.none")}</p>;
  return <ProblemList draft={draft} problems={problems} targetHref={targetHref} />;
}

/** A problem of a deck's health, as the dock lists it: what it says, and where it is fixed. */
export interface DeckProblem {
  text: string;
  route: StudioRoute;
}

/**
 * The problems a deck's health found, as the dock lists them: the check
 * of its data in one line, at the deck's health; then each side whose
 * language is not stated, each group of cards that say the same (at its
 * first card) and each finding in its Markdown, at its field of the card
 * inspector.
 */
export function deckProblemsOf(deck: Deck, health: Health, { t, readerText }: Pick<I18n, "t" | "readerText">): DeckProblem[] {
  const at = (spot: CardSpot) => spotRoute(deck.url, spot);
  const place = (spot: CardSpot) => placeText(spot, t, readerText);
  const { violationCount } = health.report;
  const atHealth: StudioRoute = { screen: "health", instanceUrl: instanceUrlOfDeck(deck.url), deckUrl: deck.url };
  const data: DeckProblem[] = violationCount === 0 ? [] : [{ text: t("studio.dock.deckData", { count: violationCount }), route: atHealth }];
  return [
    ...data,
    ...(health.unstated ?? []).map((spot) => ({ text: t("studio.dock.unstated", { place: place(spot) }), route: at(spot) })),
    ...health.duplicates.map((group) => {
      const spot: CardSpot = { card: group[0]!, place: { tab: "content" } };
      return { text: t("studio.dock.duplicate", { place: place(spot) }), route: at(spot) };
    }),
    ...health.markdown.map((problem) => ({ text: `${place(problem)}: ${problemText(problem.finding, t)}`, route: at(problem) })),
  ];
}

/** A deck's problems in the dock: its health, checked if no screen has yet, each a link to where it is fixed. */
function DeckProblems({ useCases, deck }: { useCases: UseCases; deck: Deck }) {
  const i18n = useI18n();
  const { t, errorText } = i18n;
  const health = useQuery(deckHealthQuery(useCases, useQueryClient(), instanceUrlOfDeck(deck.url), deck));
  if (health.data === undefined) return health.error ? <ErrorMessage error={errorText(health.error)} /> : <Loading label={t("studio.dock.checking")} />;
  const found = deckProblemsOf(deck, health.data, i18n);
  if (found.length === 0) return <p class="hint">{t("studio.dock.none")}</p>;
  return (
    <ul class="studio-health-list" aria-label={t("studio.dock.problems")}>
      {found.map((one, index) => (
        <li key={index}>
          <a href={studioRouteToHash(one.route)}>{one.text}</a>
        </li>
      ))}
    </ul>
  );
}
