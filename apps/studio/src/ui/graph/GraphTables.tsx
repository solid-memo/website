// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The graph as tables, in place of the drawing (GraphScreen): its nodes
 * (each by its name, with its kind, the document that defines it and its
 * classes) and its edges (from, link, to), both as the filters show
 * them, a page of each at a time. A node's name selects it, as does
 * Enter on its row, and opens it in the aside, as a click on it in the
 * drawing does.
 */

import { useState } from "preact/hooks";
import type { GraphEdge, GraphNode } from "@solid-memo/domain/instanceGraph";
import { useI18n } from "@solid-memo/ui/i18n";
import { Pager, paginate } from "@solid-memo/ui/Pager";
import { DataTable } from "../shell/DataTable";
import { shortName, type ShownGraph } from "./graphModel";

/** How many rows a table's page holds. */
const ROWS_A_PAGE = 100;

/** The name of a link: its predicate in short; a document's subjects, which no statement links, by the word for it. */
export function predicateText(predicate: string, t: ReturnType<typeof useI18n>["t"]): string {
  return predicate === "" ? t("studio.graph.defines") : shortName(predicate);
}

export function GraphTables({
  shown,
  labels,
  onSelect,
  kindOf,
}: {
  shown: ShownGraph;
  labels: ReadonlyMap<string, string>;
  onSelect: (id: string) => void;
  kindOf: (node: GraphNode) => string;
}) {
  const { t } = useI18n();
  const [nodePage, setNodePage] = useState(1);
  const [edgePage, setEdgePage] = useState(1);
  const nodes = paginate(shown.nodes, nodePage, ROWS_A_PAGE);
  const edges = paginate(shown.edges, edgePage, ROWS_A_PAGE);
  const select = (id: string) => (
    <button type="button" class="graph-link" onClick={() => onSelect(id)}>
      {labels.get(id)}
    </button>
  );
  const edgeKey = (edge: GraphEdge) => `${edge.from} ${edge.predicate} ${edge.to}`;
  return (
    <>
      <DataTable
        caption={t("studio.graph.nodes.caption")}
        rows={nodes.items}
        keyOf={(node) => node.id}
        name={{
          key: "label",
          label: t("studio.graph.nodes.label"),
          cell: (node) => (
            <>
              {select(node.id)}
              <br />
              <code>{node.id}</code>
            </>
          ),
        }}
        columns={[
          { key: "kind", label: t("studio.graph.nodes.kind"), cell: kindOf },
          {
            key: "document",
            label: t("studio.graph.nodes.document"),
            cell: (node) =>
              node.document === undefined || node.document === node.id
                ? null
                : select(node.document),
          },
          {
            key: "types",
            label: t("studio.graph.nodes.types"),
            cell: (node) => node.types.map(shortName).join(", "),
          },
        ]}
        onOpen={(node) => onSelect(node.id)}
      />
      <Pager
        page={nodes.currentPage}
        pageCount={nodes.pageCount}
        onPageChange={setNodePage}
        label={t("studio.graph.nodes.pages")}
      />
      <DataTable
        caption={t("studio.graph.edges.caption")}
        rows={edges.items}
        keyOf={edgeKey}
        name={{
          key: "from",
          label: t("studio.graph.edges.from"),
          cell: (edge) => select(edge.from),
        }}
        columns={[
          {
            key: "predicate",
            label: t("studio.graph.edges.predicate"),
            cell: (edge) => <code>{predicateText(edge.predicate, t)}</code>,
          },
          { key: "to", label: t("studio.graph.edges.to"), cell: (edge) => select(edge.to) },
        ]}
        keys={false}
      />
      <Pager
        page={edges.currentPage}
        pageCount={edges.pageCount}
        onPageChange={setEdgePage}
        label={t("studio.graph.edges.pages")}
      />
    </>
  );
}
