import type { ComponentChildren } from "preact";
import { useEffect, useId, useState } from "preact/hooks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { folded, type LangText } from "@solid-memo/domain/langText";
import type { ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";
import type { ValidationReport } from "@solid-memo/domain/validation";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { draftsKey } from "../DraftsContainer";
import { studioRouteToHash, type StudioRoute } from "../router";
import { sameItem, type WorkItem } from "./prefs";
import { ProblemCount } from "./ProblemCount";
import { draftNameOf } from "./titles";
import { deckOf, sectionHome, sectionOf, SIDEBAR_SECTIONS } from "./workspaceLayout";

/**
 * The sidebar's content, in the shell's `nav` (StudioShell): first the
 * decks and drafts the user pinned (`pinned`), if any; then the open
 * instance's sections, the one the route is in marked, its health with
 * the problems the instance's check found (none said while there are
 * none, or while it is not made); then the instance's decks, each at its
 * cards, and its drafts, each at its overview, the deck or draft the
 * route is about marked, both kept to those whose name holds the
 * filter, case and accents aside, and above them those opened last
 * (`recent`) but those pinned. Each has a button that pins it, or not
 * (`onPin`, pressed while it is pinned); one the instance no longer has,
 * or not yet read, is left out. The decks and drafts are the
 * workspace's own queries, and the check is read only as the screens
 * made it: the sidebar does not check the instance on its own.
 */
export function StudioSidebar({
  useCases,
  instance,
  route,
  pinned,
  recent,
  onPin,
}: {
  useCases: UseCases;
  instance: Instance;
  route: StudioRoute;
  /** The decks and drafts pinned, in their order. */
  pinned: readonly WorkItem[];
  /** Those opened last, the last first. */
  recent: readonly WorkItem[];
  /** Pin an item, or unpin one pinned. */
  onPin: (item: WorkItem) => void;
}) {
  const { t, errorText, readerText } = useI18n();
  const [filter, setFilter] = useState("");
  const pinnedId = useId();
  const recentId = useId();
  const decksId = useId();
  const draftsId = useId();
  const decksQuery = useQuery({
    queryKey: ["decks", instance.url],
    queryFn: () => useCases.listDecks(instance.url),
  });
  const draftsQuery = useQuery({
    queryKey: draftsKey(instance.url),
    queryFn: () => useCases.listReleaseDrafts(instance.url),
  });
  const problems = useInstanceCheck(instance.url)?.violationCount ?? 0;
  const section = sectionOf(route);
  const deckUrl = deckOf(route);
  const draftUrl = "draftUrl" in route ? route.draftUrl : null;
  const wanted = folded(filter.trim());
  const kept = (...texts: (LangText | string)[]) =>
    texts.flatMap((text) => (typeof text === "string" ? [text] : Object.values(text))).some((text) => folded(text).includes(wanted));
  const decks = decksQuery.data?.filter((deck) => kept(deck.title));
  const drafts = draftsQuery.data?.filter((draft) => kept(draft.title, draft.name));
  const href = (to: StudioRoute) => studioRouteToHash(to);
  const draftName = (draft: ReleaseDraftSummary) => draftNameOf(draft, { t, readerText });
  const isPinned = (item: WorkItem) => pinned.some((each) => sameItem(each, item));

  /** An item's entry: its link (a draft that cannot be read, its name), and the button that pins it. */
  const entry = (item: WorkItem, name: string, link: ComponentChildren, after?: ComponentChildren) => (
    <li key={`${item.kind} ${item.url}`}>
      {link}
      {after}
      <button
        type="button"
        class="icon studio-pin"
        aria-label={t("studio.shell.pin", { name })}
        title={t("studio.shell.pin", { name })}
        aria-pressed={isPinned(item)}
        onClick={() => onPin(item)}
      >
        <PinIcon />
      </button>
    </li>
  );
  const deckEntry = (deck: Deck) =>
    entry(
      { kind: "deck", url: deck.url },
      readerText(deck.title),
      <a href={href({ screen: "cards", deckUrl: deck.url })} aria-current={deck.url === deckUrl ? "true" : undefined}>
        {readerText(deck.title)}
      </a>,
    );
  const draftEntry = (draft: ReleaseDraftSummary) =>
    entry(
      { kind: "draft", url: draft.url },
      draftName(draft),
      draft.readable ? (
        <a href={href({ screen: "draft", draftUrl: draft.url })} aria-current={draft.url === draftUrl ? "true" : undefined}>
          {draftName(draft)}
        </a>
      ) : (
        draftName(draft)
      ),
      <>
        {" "}
        <span class="hint">{t("studio.shell.version", { version: draft.version })}</span>
      </>,
    );
  /** The entries of the items the instance has, in their order. */
  const entries = (items: readonly WorkItem[]) =>
    items.flatMap((item) => {
      if (item.kind === "deck") {
        const deck = decksQuery.data?.find((each) => each.url === item.url);
        return deck === undefined ? [] : [deckEntry(deck)];
      }
      const draft = draftsQuery.data?.find((each) => each.url === item.url);
      return draft === undefined ? [] : [draftEntry(draft)];
    });
  const pinnedEntries = entries(pinned);
  const recentEntries = entries(recent.filter((item) => !isPinned(item)));

  return (
    <>
      {pinnedEntries.length > 0 && (
        <>
          <p id={pinnedId} class="studio-sidebar-label">
            {t("studio.shell.pinned")}
          </p>
          <ul class="studio-sidebar-list" aria-labelledby={pinnedId}>
            {pinnedEntries}
          </ul>
        </>
      )}
      <ul class="studio-sections">
        {SIDEBAR_SECTIONS.map((each) => (
          <li key={each}>
            <a href={href(sectionHome(each, instance.url))} aria-current={each === section ? "page" : undefined}>
              {t(`studio.shell.section.${each}`)}
            </a>
            {each === "health" && problems > 0 && <ProblemCount count={problems} />}
          </li>
        ))}
      </ul>
      <label class="studio-filter">
        {t("studio.shell.filter")}
        <input type="search" value={filter} onInput={(event) => setFilter(event.currentTarget.value)} />
      </label>
      {recentEntries.length > 0 && (
        <>
          <p id={recentId} class="studio-sidebar-label">
            {t("studio.shell.recent")}
          </p>
          <ul class="studio-sidebar-list" aria-labelledby={recentId}>
            {recentEntries}
          </ul>
        </>
      )}
      <p id={decksId} class="studio-sidebar-label">
        {t("studio.shell.deckList")}
      </p>
      <ErrorMessage error={errorText(decksQuery.error)} />
      {decks !== undefined &&
        (decks.length === 0 ? (
          <p class="hint">{t("studio.shell.noDecks")}</p>
        ) : (
          <ul class="studio-sidebar-list" aria-labelledby={decksId}>
            {decks.map(deckEntry)}
          </ul>
        ))}
      <p id={draftsId} class="studio-sidebar-label">
        {t("studio.shell.draftList")}
      </p>
      <ErrorMessage error={errorText(draftsQuery.error)} />
      {drafts !== undefined &&
        (drafts.length === 0 ? (
          <p class="hint">{t("studio.shell.noDrafts")}</p>
        ) : (
          <ul class="studio-sidebar-list" aria-labelledby={draftsId}>
            {drafts.map(draftEntry)}
          </ul>
        ))}
    </>
  );
}

/**
 * The instance's check (the query of ["validation", url], useDataCheck)
 * as the screens made it, as it changes: undefined until one has. It is
 * read from the cache, never asked for.
 */
function useInstanceCheck(instanceUrl: string): ValidationReport | undefined {
  const queryClient = useQueryClient();
  const read = () => queryClient.getQueryData<ValidationReport>(["validation", instanceUrl]);
  const [report, setReport] = useState(read);
  useEffect(() => {
    setReport(read());
    return queryClient.getQueryCache().subscribe(() => setReport(read()));
  }, [queryClient, instanceUrl]);
  return report;
}

/** A pin, as on a board: what pins a deck or a draft to the sidebar's top. */
function PinIcon() {
  return (
    <svg
      class="icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 17v5" />
      <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" />
    </svg>
  );
}
