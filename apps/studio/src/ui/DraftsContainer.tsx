import { useEffect } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreatedDraft, NewDraft } from "@solid-memo/application/releaseDrafts";
import type { UseCases } from "@solid-memo/application/useCases";
import { decksOf } from "@solid-memo/domain/deckTree";
import type { Instance } from "@solid-memo/domain/instance";
import type { ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";
import { useDataCheck } from "@solid-memo/ui/dataCheck";
import { catalogScope, deckTreeKey } from "@solid-memo/ui/deckTreeEditor";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { draftKey } from "./draftEditor";
import { DraftsScreen } from "./DraftsScreen";

/** The query of an instance's drafts: the sidebar and the drafts screen share it. */
export function draftsKey(instanceUrl: string): readonly unknown[] {
  return ["releaseDrafts", instanceUrl];
}

/**
 * The drafts screen's data: the instance's drafts (draftsKey) and its
 * decks as the user arranged them (Home's query), to start a draft of
 * one. Making a draft or deleting one writes the catalogue, so it waits
 * its turn with the other writes of the catalogue (catalogScope), and the
 * drafts are read afresh after it. Both are held until the instance's
 * data check is done, and while the catalogue is set aside
 * (useDataCheck). A deleted draft's URL is a new draft's when one of
 * its name is made, so what was read at a draft's URL (draftKey) is
 * forgotten when one is deleted, and when one is made. A draft made is
 * opened (`onCreated`) once the screen has said so, unless it was made of
 * a copy of a release: the screen then offers to start that release's
 * next version instead.
 */
export function DraftsContainer({
  useCases,
  instance,
  healthHref,
  releasesHref,
  draftHref,
  onCreated,
}: {
  useCases: UseCases;
  instance: Instance;
  healthHref: string;
  releasesHref: string;
  draftHref: (draft: ReleaseDraftSummary) => string;
  /** A draft was made: open it. */
  onCreated: (created: CreatedDraft) => void;
}) {
  const { t, errorText } = useI18n();
  const queryClient = useQueryClient();
  const check = useDataCheck(useCases, instance.url);
  const draftsQuery = useQuery({
    queryKey: draftsKey(instance.url),
    queryFn: () => useCases.listReleaseDrafts(instance.url),
  });
  const treeQuery = useQuery({
    queryKey: deckTreeKey(instance.url),
    queryFn: () => useCases.listDeckTree(instance.url),
  });
  const reread = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: draftsKey(instance.url) }),
      // The instance's check covers its drafts' documents too.
      queryClient.invalidateQueries({ queryKey: ["validation", instance.url] }),
    ]);
  const forget = (draft: ReleaseDraftSummary) => queryClient.removeQueries({ queryKey: draftKey(draft.url) });
  const createMutation = useMutation({
    scope: { id: catalogScope(instance.url) },
    mutationFn: (from: NewDraft) => useCases.createReleaseDraft(instance.url, from),
    onSuccess: (created) => created !== null && forget(created.draft),
    onSettled: reread,
  });
  const deleteMutation = useMutation({
    scope: { id: catalogScope(instance.url) },
    mutationFn: async (draft: ReleaseDraftSummary) => {
      await useCases.deleteReleaseDraft(draft);
      return draft;
    },
    onSuccess: forget,
    onSettled: reread,
  });

  const created = createMutation.data ?? null;
  // After the screen's own effects, which tell the activity of it.
  useEffect(() => {
    if (created !== null && created.basedOn === undefined) onCreated(created);
  }, [created]);

  const error = draftsQuery.error ?? treeQuery.error;
  if (error) return <ErrorMessage error={errorText(error)} />;
  if (draftsQuery.data === undefined || treeQuery.data === undefined) return <Loading label={t("studio.drafts.loading")} />;

  return (
    <DraftsScreen
      instance={instance}
      drafts={draftsQuery.data}
      decks={decksOf(treeQuery.data.children)}
      readOnly={check.readOnly() ?? (check.arrangementSetAside ? "setAside" : null)}
      healthHref={healthHref}
      releasesHref={releasesHref}
      draftHref={draftHref}
      creating={createMutation.isPending}
      // No file picked: nothing was made, and nothing is said.
      created={created}
      createError={errorText(createMutation.error)}
      onCreate={(from) => createMutation.mutate(from)}
      deleting={deleteMutation.isPending ? deleteMutation.variables! : null}
      deleted={deleteMutation.data ?? null}
      deleteError={errorText(deleteMutation.error)}
      onDelete={(draft) => deleteMutation.mutate(draft)}
    />
  );
}
