// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The node selected in the graph, in the aside (docs/studio.md, Graph):
 * its IRI, its kind, the document that defines it, its classes, the
 * values the documents state of it (each in its language, its language
 * tag or its datatype after it, and the document it is stated in when
 * not its own) and its links, from it and
 * to it, each a button that selects the node at its other end. A leaf
 * says why it was not read; an IRI no document defines, that it was
 * named and found nowhere. A long list of links, classes or values shows
 * its first entries, and all on asking, the focus going to the first
 * entry shown then. The node and its links are found in an index built
 * once for the graph.
 * Following a link from the aside moves the focus to the heading of the
 * node it goes to, so the graph can be walked link by link.
 */

import type { ComponentChildren } from "preact";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { GraphEdge, InstanceGraph } from "@solid-memo/domain/instanceGraph";
import type { Instance } from "@solid-memo/domain/instance";
import { useI18n } from "@solid-memo/ui/i18n";
import { nodeIndexOf, shortName } from "./graphModel";
import { kindText, useLabels } from "./GraphScreen";
import { predicateText } from "./GraphTables";

/** How many entries a list (links, classes, values) shows before it is asked for all. */
const LINKS_AT_FIRST = 50;

/** Why a node was not read, or found; none for one read. */
const NOTES = {
  outsideLeaf: "studio.graph.node.outside",
  podLeaf: "studio.graph.node.inPod",
  vocabularyLeaf: "studio.graph.node.vocabulary",
  missing: "studio.graph.node.missing",
} as const;

/**
 * A value's language tag as BCP 47 writes it ("en-US", "zh-Hant"): the
 * parser reads every tag in lower case. One Intl refuses as it is.
 */
function writtenTag(tag: string): string {
  try {
    return Intl.getCanonicalLocales(tag)[0]!;
  } catch {
    return tag;
  }
}

/**
 * The first entries of `items`, as `render` lists them in the element
 * given `list`, with a button (`more`, by the count of all; `render`
 * places it) that shows them all. Showing all, its button gone, the
 * focus goes to the first entry it showed: its button, or the entry.
 */
function FirstOf<T>({
  items,
  more,
  render,
}: {
  items: readonly T[];
  more: (count: number) => string;
  render: (
    listed: readonly T[],
    list: (element: HTMLElement | null) => void,
    button: ComponentChildren,
  ) => ComponentChildren;
}) {
  const [all, setAll] = useState(false);
  const list = useRef<HTMLElement | null>(null);
  const listed = all ? items : items.slice(0, LINKS_AT_FIRST);
  useEffect(() => {
    if (!all) return;
    const first = list.current!.children[LINKS_AT_FIRST] as HTMLElement;
    (first.querySelector("button") ?? first).focus();
  }, [all]);
  const listRef = useCallback((element: HTMLElement | null) => {
    list.current = element;
  }, []);
  return render(
    listed,
    listRef,
    listed.length < items.length && (
      <button type="button" onClick={() => setAll(true)}>
        {more(items.length)}
      </button>
    ),
  );
}

/** A list of links, each by its predicate and the node at its other end (`end`), the first ones until all are asked for. */
function Links({
  heading,
  edges,
  end,
  labels,
  onSelect,
}: {
  heading: string;
  edges: readonly GraphEdge[];
  end: (edge: GraphEdge) => string;
  labels: ReadonlyMap<string, string>;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <h4>{heading}</h4>
      {edges.length === 0 ? (
        <p class="hint">{t("studio.graph.node.noLinks")}</p>
      ) : (
        <FirstOf
          items={edges}
          more={(count) => t("studio.graph.node.showAll", { count })}
          render={(listed, list, button) => (
            <>
              <ul class="graph-links" ref={list}>
                {listed.map((edge) => (
                  <li key={`${edge.predicate} ${end(edge)}`}>
                    <code>{predicateText(edge.predicate, t)}</code>{" "}
                    <button type="button" class="graph-link" onClick={() => onSelect(end(edge))}>
                      {labels.get(end(edge))}
                    </button>
                  </li>
                ))}
              </ul>
              {button}
            </>
          )}
        />
      )}
    </>
  );
}

/** What the aside says of the node `nodeId` of `graph`; how to select one, with none (or one the graph has not). */
export function GraphNodePane({
  instance,
  graph,
  nodeId,
  onSelect,
}: {
  instance: Instance;
  graph: InstanceGraph;
  nodeId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t, partLang } = useI18n();
  const labels = useLabels(graph, instance);
  const heading = useRef<HTMLHeadingElement>(null);
  // Whether the node shown was reached by a link of the aside's, whose button is gone with the node it was of.
  const followed = useRef(false);
  const index = useMemo(() => nodeIndexOf(graph), [graph]);
  const indexed = nodeId === null ? undefined : index.get(nodeId);
  const node = indexed?.node;
  useEffect(() => {
    if (!followed.current) return;
    followed.current = false;
    heading.current?.focus();
  }, [node?.id]);
  if (node === undefined) return <p class="hint">{t("studio.graph.node.none")}</p>;
  const follow = (id: string) => {
    followed.current = id !== node.id;
    onSelect(id);
  };
  const { outgoing, incoming } = indexed!;
  const note =
    node.unreadable === true
      ? "studio.graph.node.unreadable"
      : node.found === false
        ? "studio.graph.node.absent"
        : node.kind in NOTES
          ? NOTES[node.kind as keyof typeof NOTES]
          : null;
  return (
    <section class="graph-node-pane" aria-labelledby="graph-node-heading">
      <h3 id="graph-node-heading" ref={heading} tabindex={-1}>
        {labels.get(node.id)}
      </h3>
      <p>
        <code class="graph-iri">{node.id}</code>
      </p>
      {note !== null && <p>{t(note)}</p>}
      <dl>
        <dt>{t("studio.graph.nodes.kind")}</dt>
        <dd>{kindText(node, t)}</dd>
        {node.document !== undefined && node.document !== node.id && (
          <>
            <dt>{t("studio.graph.nodes.document")}</dt>
            <dd>
              <button type="button" class="graph-link" onClick={() => follow(node.document!)}>
                {labels.get(node.document)}
              </button>
            </dd>
          </>
        )}
        {node.types.length > 0 && (
          <>
            <dt>{t("studio.graph.nodes.types")}</dt>
            <FirstOf
              key={`types ${node.id}`}
              items={node.types}
              more={(count) => t("studio.graph.node.showAllTypes", { count })}
              render={(listed, list, button) => (
                <dd ref={list}>
                  {listed.map((type) => (
                    <button
                      key={type}
                      type="button"
                      class="graph-link"
                      onClick={() => follow(type)}
                    >
                      {shortName(type)}
                    </button>
                  ))}
                  {button}
                </dd>
              )}
            />
          </>
        )}
      </dl>
      {node.literals.length > 0 && (
        <>
          <h4>{t("studio.graph.node.values")}</h4>
          <FirstOf
            key={`values ${node.id}`}
            items={node.literals}
            more={(count) => t("studio.graph.node.showAllValues", { count })}
            render={(listed, list, button) => (
              <>
                <dl class="graph-values" ref={list}>
                  {listed.map((literal, at) => (
                    // The first value shown on asking takes the focus, as a link's button does.
                    <div key={at} tabindex={at === LINKS_AT_FIRST ? -1 : undefined}>
                      <dt>
                        <code>{shortName(literal.predicate)}</code>
                      </dt>
                      <dd>
                        <span lang={partLang(literal.language)}>{literal.value}</span>
                        {/* Its language tag, as the datatype is said: a value has one or the other. */}
                        {(literal.language ?? literal.datatype) !== undefined && (
                          <>
                            {" "}
                            <code class="hint">
                              {literal.language === undefined
                                ? shortName(literal.datatype!)
                                : `@${writtenTag(literal.language)}`}
                            </code>
                          </>
                        )}
                        {literal.document !== node.document && (
                          <span class="hint">
                            {" "}
                            {t("studio.graph.node.statedIn", {
                              document: labels.get(literal.document)!,
                            })}
                          </span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
                {button}
              </>
            )}
          />
        </>
      )}
      {/* Each node's lists of its own, shown at their first links. */}
      <Links
        key={`out ${node.id}`}
        heading={t("studio.graph.node.outgoing")}
        edges={outgoing}
        end={(edge) => edge.to}
        labels={labels}
        onSelect={follow}
      />
      <Links
        key={`in ${node.id}`}
        heading={t("studio.graph.node.incoming")}
        edges={incoming}
        end={(edge) => edge.from}
        labels={labels}
        onSelect={follow}
      />
    </section>
  );
}
