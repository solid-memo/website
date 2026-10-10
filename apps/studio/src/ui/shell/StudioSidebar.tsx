import { useEffect, useId, useState } from "preact/hooks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import { folded, type LangText } from "@solid-memo/domain/langText";
import type { ValidationReport } from "@solid-memo/domain/validation";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { draftsKey } from "../DraftsContainer";
import { studioRouteToHash, type StudioRoute } from "../router";
import { deckOf, sectionHome, sectionOf, SIDEBAR_SECTIONS } from "./workspaceLayout";

/**
 * The sidebar's content, in the shell's `nav` (StudioShell): the open
 * instance's sections, the one the route is in marked, its health with
 * the problems the instance's check found (none said while there are
 * none, or while it is not made); then the instance's decks, each at its
 * cards, and its drafts, each at its overview, the deck or draft the
 * route is about marked, both kept to those whose name holds the
 * filter, case and accents aside. The decks and drafts are the
 * workspace's own queries, and the check is read only as the screens
 * made it: the sidebar does not check the instance on its own.
 */
export function StudioSidebar({ useCases, instance, route }: { useCases: UseCases; instance: Instance; route: StudioRoute }) {
  const { t, errorText, readerText } = useI18n();
  const [filter, setFilter] = useState("");
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

  return (
    <>
      <ul class="studio-sections">
        {SIDEBAR_SECTIONS.map((each) => (
          <li key={each}>
            <a href={href(sectionHome(each, instance.url))} aria-current={each === section ? "page" : undefined}>
              {t(`studio.shell.section.${each}`)}
            </a>
            {each === "health" && problems > 0 && (
              <span class="studio-count">
                <span aria-hidden="true">{problems}</span>
                <span class="visually-hidden">{t("studio.shell.problems", { count: problems })}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
      <label class="studio-filter">
        {t("studio.shell.filter")}
        <input type="search" value={filter} onInput={(event) => setFilter(event.currentTarget.value)} />
      </label>
      <p id={decksId} class="studio-sidebar-label">
        {t("studio.shell.deckList")}
      </p>
      <ErrorMessage error={errorText(decksQuery.error)} />
      {decks !== undefined &&
        (decks.length === 0 ? (
          <p class="hint">{t("studio.shell.noDecks")}</p>
        ) : (
          <ul class="studio-sidebar-list" aria-labelledby={decksId}>
            {decks.map((deck) => (
              <li key={deck.url}>
                <a href={href({ screen: "cards", deckUrl: deck.url })} aria-current={deck.url === deckUrl ? "true" : undefined}>
                  {readerText(deck.title)}
                </a>
              </li>
            ))}
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
            {drafts.map((draft) => {
              const name = Object.keys(draft.title).length === 0 ? t("studio.drafts.untitled", { name: draft.name }) : readerText(draft.title);
              return (
                <li key={draft.url}>
                  {draft.readable ? (
                    <a href={href({ screen: "draft", draftUrl: draft.url })} aria-current={draft.url === draftUrl ? "true" : undefined}>
                      {name}
                    </a>
                  ) : (
                    name
                  )}{" "}
                  <span class="hint">{t("studio.shell.version", { version: draft.version })}</span>
                </li>
              );
            })}
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
