// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The graph screen's data: the instance read as a graph
 * (readInstanceGraph), the user's storages telling which leaves are in
 * their pod. It reads every document Solid Memo keeps in the instance, so
 * it says how many it has read as it goes, and it is not read again as
 * the window takes the focus. A node selected on the screen opens the
 * aside's drawer, on a screen too narrow for the aside beside it
 * (RevealAside); letting go of it does not (the press that did, outside
 * the drawer, has closed it). The aside's node (GraphNodeContainer) shares the query,
 * and never reads it itself.
 */

import { skipToken, useQuery } from "@tanstack/react-query";
import { useContext, useState } from "preact/hooks";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import type { InstanceGraph } from "@solid-memo/domain/instanceGraph";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { RevealAside } from "../shell/revealAside";
import { GraphNodePane } from "./GraphNodePane";
import { GraphScreen } from "./GraphScreen";
import { queryKeys } from "../queryKeys";

export function GraphContainer({
  useCases,
  instance,
  webId,
  selected,
  onSelect,
}: {
  useCases: UseCases;
  instance: Instance;
  webId: string;
  /** The node selected, by id; null for none. */
  selected: string | null;
  /** Selects a node, by id; null lets go of the one selected. */
  onSelect: (id: string | null) => void;
}) {
  const { t, errorText } = useI18n();
  const revealAside = useContext(RevealAside);
  const [progress, setProgress] = useState<{ read: number; total: number } | null>(null);
  const graphQuery = useQuery({
    queryKey: queryKeys.instanceGraph(instance.url, webId),
    queryFn: () =>
      useCases.readInstanceGraph(instance.url, webId, {
        onProgress: (read, total) => setProgress({ read, total }),
      }),
    refetchOnWindowFocus: false,
  });
  if (graphQuery.error) return <ErrorMessage error={errorText(graphQuery.error)} />;
  if (graphQuery.data === undefined)
    return (
      <Loading
        label={
          progress === null
            ? t("studio.graph.loading")
            : t("studio.graph.reading", { read: progress.read, count: progress.total })
        }
      />
    );
  return (
    <GraphScreen
      instance={instance}
      graph={graphQuery.data}
      selected={selected}
      onSelect={(id) => {
        onSelect(id);
        if (id !== null) revealAside();
      }}
    />
  );
}

/** The node selected, in the aside, from the graph screen's query once it has read the graph; how to select one until then. */
export function GraphNodeContainer({
  instance,
  webId,
  nodeId,
  onSelect,
}: {
  instance: Instance;
  webId: string;
  nodeId: string | null;
  onSelect: (id: string) => void;
}) {
  const graphQuery = useQuery<InstanceGraph>({
    queryKey: queryKeys.instanceGraph(instance.url, webId),
    queryFn: skipToken,
  });
  return (
    <GraphNodePane
      instance={instance}
      graph={graphQuery.data ?? { nodes: [], edges: [] }}
      nodeId={nodeId}
      onSelect={onSelect}
    />
  );
}
