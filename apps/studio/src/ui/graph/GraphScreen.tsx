// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The graph screen (docs/studio.md, Graph): an instance's Solid Memo data
 * as a graph (domain/instanceGraph.ts), drawn (GraphView) or, as asked,
 * as two tables, of its nodes and of its edges (GraphTables). Above it a
 * row of filters: a search that finds a node by its name or IRI and
 * selects it, the cards, wrong options, review states and answers and
 * leaves each shown or hidden, only the selected node and its neighbors,
 * the tables in place of the drawing, and, last, the vocabulary terms,
 * hidden at first (DEFAULT_FILTERS); and how many
 * nodes and edges are shown of all, and, in the drawing, how many of
 * those to vocabulary terms are drawn only for the node selected or
 * pointed at (GraphView). A graph too large to draw smoothly
 * (DRAW_LIMIT) is not drawn until asked to: it says so instead, and no
 * node is ever left out unsaid. The filters are kept for the page's
 * life. The node selected is the route's (`selected`), and opens in the
 * aside (GraphNodePane). What the filters show is worked out apart from
 * the node selected unless only its neighbors are shown: selecting
 * another node leaves the layers drawn as they are.
 */

import { useMemo, useRef, useState } from "preact/hooks";
import type { GraphNode, InstanceGraph } from "@solid-memo/domain/instanceGraph";
import type { Instance } from "@solid-memo/domain/instance";
import { ensureTrailingSlash } from "@solid-memo/domain/instanceLayout";
import { folded } from "@solid-memo/domain/langText";
import { useI18n } from "@solid-memo/ui/i18n";
import { useRemembered } from "@solid-memo/ui/remembered";
import { GraphTables } from "./GraphTables";
import { GraphView } from "./GraphView";
import {
  DEFAULT_FILTERS,
  distinctLabels,
  labelOf,
  NODE_GROUPS,
  shownGraph,
  tooLarge,
  type GraphFilters,
  type NodeGroup,
  type ShownGraph,
} from "./graphModel";
import { useLayout } from "./useLayout";

/** How many nodes a search lists at most. */
const FOUND_AT_MOST = 10;

/**
 * The names of a graph's nodes, by id, no two the same that can be told
 * apart: a folder by its own name, with its parent's or its path in the
 * instance only when another is named as it is (distinctLabels).
 */
export function useLabels(graph: InstanceGraph, instance: Instance): ReadonlyMap<string, string> {
  return useMemo(() => {
    const root = ensureTrailingSlash(instance.url);
    const labels = new Map(
      graph.nodes.map((node) => [node.id, labelOf(node, root, instance.name)]),
    );
    return distinctLabels(graph.nodes, labels, root);
  }, [graph, instance.url, instance.name]);
}

/** The graph drawn, once laid out: until then, how far the layout is. */
function GraphDrawing({
  instance,
  graph,
  shown,
  labels,
  selected,
  onSelect,
}: {
  instance: Instance;
  graph: InstanceGraph;
  shown: ShownGraph;
  labels: ReadonlyMap<string, string>;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { t } = useI18n();
  const { laid, progress } = useLayout(instance.url, graph, true);
  if (laid === null)
    return (
      <p class="graph-placing">
        <label>
          {t("studio.graph.placing")} <progress max={100} value={Math.round(progress * 100)} />
        </label>
      </p>
    );
  return (
    <GraphView
      nodes={shown.nodes}
      edges={shown.edges}
      positions={laid.positions}
      routes={laid.routes}
      labels={labels}
      selected={selected}
      onSelect={onSelect}
      label={t("studio.graph.heading", { instance: instance.name })}
      describe={(node) =>
        t("studio.graph.describe", { label: labels.get(node.id)!, kind: kindText(node, t) })
      }
    />
  );
}

/** A node's kind, in words. */
export function kindText(node: GraphNode, t: ReturnType<typeof useI18n>["t"]): string {
  if (node.unreadable === true) return t("studio.graph.kind.unreadable");
  return t(node.found === false ? "studio.graph.kind.absent" : `studio.graph.kind.${node.kind}`);
}

export function GraphScreen({
  instance,
  graph,
  selected,
  onSelect,
}: {
  instance: Instance;
  graph: InstanceGraph;
  /** The node selected, by id; null for none (or one the graph has not). */
  selected: string | null;
  /** Selects a node, by id; null lets go of the one selected. */
  onSelect: (id: string | null) => void;
}) {
  const { t } = useI18n();
  const [filters, setFilters] = useRemembered<GraphFilters>(
    `studio.graphFilters.${instance.url}`,
    DEFAULT_FILTERS,
  );
  const [search, setSearch] = useState("");
  const [drawAnyway, setDrawAnyway] = useState(false);
  const labels = useLabels(graph, instance);
  const chosen = selected !== null && labels.has(selected) ? selected : null;
  const searchRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(
    () => shownGraph(graph, { ...filters, neighborsOnly: false }, null),
    [graph, filters.hidden],
  );
  const near = filters.neighborsOnly && chosen !== null;
  const shown = useMemo(
    () => (near ? shownGraph(graph, filters, chosen) : filtered),
    [filtered, near && chosen],
  );
  const undrawn = useMemo(
    () => shown.edges.filter((edge) => edge.kind === "vocabulary").length,
    [shown],
  );
  const wanted = folded(search.trim());
  // The whole graph the filters show, the neighbors' too: a node found becomes the one whose they are.
  const found =
    wanted === ""
      ? []
      : filtered.nodes.filter((node) =>
          [node.id, labels.get(node.id)!].some((text) => folded(text).includes(wanted)),
        );

  const toggle = (group: NodeGroup) =>
    setFilters((current) => ({
      ...current,
      hidden: current.hidden.includes(group)
        ? current.hidden.filter((each) => each !== group)
        : [...current.hidden, group],
    }));
  const check = (label: string, on: boolean, change: () => void) => (
    <label key={label}>
      <input type="checkbox" checked={on} onChange={change} />
      {label}
    </label>
  );
  const groupCheck = (group: NodeGroup) =>
    check(t(`studio.graph.group.${group}`), !filters.hidden.includes(group), () => toggle(group));
  /** Selects a node found, the focus going back to the search, as Enter there leaves it. */
  const pick = (node: GraphNode) => {
    onSelect(node.id);
    setSearch("");
    searchRef.current!.focus();
  };

  return (
    <section class="graph-screen">
      <header>
        <h2>{t("studio.graph.heading", { instance: instance.name })}</h2>
      </header>
      <p class="hint">{t("studio.graph.intro")}</p>
      <div class="studio-filters">
        <label class="studio-filter">
          {t("studio.graph.search")}
          <input
            ref={searchRef}
            type="search"
            aria-keyshortcuts="/"
            value={search}
            onInput={(event) => setSearch(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && found.length > 0) pick(found[0]!);
            }}
          />
        </label>
        {NODE_GROUPS.map((group) => groupCheck(group))}
        {check(t("studio.graph.neighborsOnly"), filters.neighborsOnly, () =>
          setFilters((current) => ({ ...current, neighborsOnly: !current.neighborsOnly })),
        )}
        {check(t("studio.graph.table"), filters.table, () =>
          setFilters((current) => ({ ...current, table: !current.table })),
        )}
        {/* The vocabulary terms last: hidden at first, they are seldom asked for. */}
        {groupCheck("vocabulary")}
      </div>
      {wanted !== "" && (
        <div class="graph-found">
          <p role="status">
            {found.length === 0
              ? t("studio.graph.noMatch", { text: search.trim() })
              : t("studio.graph.found", { count: found.length })}
          </p>
          {found.length > 0 && (
            <ul>
              {found.slice(0, FOUND_AT_MOST).map((node) => (
                <li key={node.id}>
                  <button type="button" onClick={() => pick(node)}>
                    {labels.get(node.id)}
                  </button>{" "}
                  <code>{node.id}</code>
                </li>
              ))}
            </ul>
          )}
          {found.length > FOUND_AT_MOST && (
            <p class="hint">
              {t("studio.graph.moreFound", { count: found.length - FOUND_AT_MOST })}
            </p>
          )}
        </div>
      )}
      {filters.neighborsOnly && chosen === null && (
        <p class="hint">{t("studio.graph.neighborsHint")}</p>
      )}
      <p class="graph-counts">
        {t("studio.graph.counts", {
          nodes: t("studio.graph.nodesShown", {
            shown: shown.nodes.length,
            count: graph.nodes.length,
          }),
          edges: t("studio.graph.edgesShown", {
            shown: shown.edges.length,
            count: graph.edges.length,
          }),
        })}
      </p>
      {!filters.table && !(tooLarge(shown) && !drawAnyway) && undrawn > 0 && (
        <p class="hint">{t("studio.graph.vocabularyUndrawn", { count: undrawn })}</p>
      )}
      {filters.table ? (
        <GraphTables
          shown={shown}
          labels={labels}
          onSelect={onSelect}
          kindOf={(node) => kindText(node, t)}
        />
      ) : tooLarge(shown) && !drawAnyway ? (
        <div class="graph-large" role="note">
          <p>
            {t("studio.graph.tooLarge", {
              nodes: shown.nodes.length,
              edges: shown.edges.length,
            })}
          </p>
          <button type="button" onClick={() => setDrawAnyway(true)}>
            {t("studio.graph.drawAnyway")}
          </button>
        </div>
      ) : (
        <GraphDrawing
          instance={instance}
          graph={graph}
          shown={shown}
          labels={labels}
          selected={chosen}
          onSelect={onSelect}
        />
      )}
    </section>
  );
}
