// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { describe, expect, it, vi } from "vitest";
import type { InstanceGraph } from "@solid-memo/domain/instanceGraph";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { instanceA } from "../../test/fixtures";
import {
  CARD,
  CARDS,
  CATALOG,
  DECK,
  GONE,
  largeGraph,
  PREFERENCES,
  RELEASE,
  smallGraph,
  WEBID,
} from "../../test/graph";
import { GraphNodePane } from "./GraphNodePane";

function pane(nodeId: string | null, graph: InstanceGraph = smallGraph()) {
  const onSelect = vi.fn();
  cleanup();
  render(<GraphNodePane instance={instanceA} graph={graph} nodeId={nodeId} onSelect={onSelect} />);
  return onSelect;
}

const list = (name: string) =>
  screen.getByRole("heading", { name }).nextElementSibling as HTMLElement;

describe("GraphNodePane", () => {
  it("says how to select a node, with none or one the graph has not", () => {
    pane(null);
    expect(screen.getByText("Select a node in the graph to see what it says.")).toBeInTheDocument();
    pane("https://elsewhere.example/x");
    expect(screen.getByText("Select a node in the graph to see what it says.")).toBeInTheDocument();
  });

  it("shows a node's address, kind, document, classes and values, each in its language", () => {
    const onSelect = pane(CARD);
    expect(screen.getByRole("heading", { name: "decks/capitals#sweden" })).toBeInTheDocument();
    expect(screen.getByText(CARD)).toBeInTheDocument();
    expect(screen.getByText("resource")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "decks/capitals.ttl" })[0]!);
    expect(onSelect).toHaveBeenLastCalledWith(CARDS);
    fireEvent.click(screen.getAllByRole("button", { name: "sm:Card" })[0]!);
    expect(onSelect).toHaveBeenLastCalledWith(SM.Card);
    expect(screen.getByText("Sweden")).not.toHaveAttribute("lang");
    expect(screen.getByText("Stockholm")).toHaveAttribute("lang", "sv");
  });

  it("says a value's language tag after it, as stated, and none for a value with none", () => {
    const hintOf = (value: string) =>
      within(list("Values")).getByText(value).closest("dd")!.querySelector("code.hint")
        ?.textContent;
    pane(CARD);
    expect(hintOf("Sweden")).toBe("@en");
    expect(hintOf("Stockholm")).toBe("@sv");
    expect(screen.getByText("@sv")).not.toHaveAttribute("lang");
    pane(DECK);
    expect(hintOf("Capitals")).toBe("@en");
    expect(hintOf("2026-10-01")).toBe("xsd:date");
    pane(WEBID);
    expect(hintOf("Alice")).toBeUndefined();
  });

  it("writes a language tag as BCP 47 does, the parser having read it in lower case", () => {
    const graph = smallGraph();
    const card = graph.nodes.find((node) => node.id === CARD)!;
    const stated = (value: string, language: string) =>
      card.literals.push({ predicate: SM.back, value, language, document: CARDS });
    stated("Lift", "en-gb");
    stated("首都", "zh-hant");
    stated("Odd", "en-abcdefghijk");
    pane(CARD, graph);
    const hintOf = (value: string) =>
      within(list("Values")).getByText(value).closest("dd")!.querySelector("code.hint")!
        .textContent;
    expect(hintOf("Lift")).toBe("@en-GB");
    expect(hintOf("首都")).toBe("@zh-Hant");
    // One Intl refuses, as it is.
    expect(hintOf("Odd")).toBe("@en-abcdefghijk");
  });

  it("lists the links from a node and to it, each selecting the node at its other end", () => {
    const onSelect = pane(CARD);
    const from = list("Links from it");
    expect(within(from).getByText("sm:distractor")).toBeInTheDocument();
    fireEvent.click(within(from).getByRole("button", { name: "sweden-d1" }));
    expect(onSelect).toHaveBeenLastCalledWith(`${CARDS}#sweden-d1`);
    const to = list("Links to it");
    expect(within(to).getByText("defines")).toBeInTheDocument();
    fireEvent.click(within(to).getByRole("button", { name: "decks/capitals.ttl" }));
    expect(onSelect).toHaveBeenLastCalledWith(CARDS);
  });

  it("says a value's datatype, and the document that states it, when not the node's own", () => {
    pane(DECK);
    expect(screen.getByText("xsd:date")).toBeInTheDocument();
    pane(WEBID);
    expect(screen.getByText("stated in catalog.ttl")).toBeInTheDocument();
  });

  it("says why a leaf was not read, and what an IRI found in no document or a document not there is", () => {
    pane(WEBID);
    expect(
      screen.getByText("Not fetched: in your Pod, but not Solid Memo data."),
    ).toBeInTheDocument();
    pane(RELEASE);
    expect(screen.getByText("Not fetched: outside your Pod.")).toBeInTheDocument();
    pane(SM.Card);
    expect(screen.getByText("Not fetched: a vocabulary term.")).toBeInTheDocument();
    pane(GONE);
    expect(screen.getByText("Named here, but found in no document.")).toBeInTheDocument();
    pane(PREFERENCES);
    expect(screen.getByText("This document is not there.")).toBeInTheDocument();
    expect(list("Links from it")).toHaveTextContent("None.");
  });

  it("says a document that could not be read was not", () => {
    const graph = smallGraph();
    pane(PREFERENCES, {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === PREFERENCES ? { ...node, unreadable: true as const } : node,
      ),
    });
    expect(screen.getByText("This document could not be read.")).toBeInTheDocument();
    expect(screen.getByText("document that could not be read")).toBeInTheDocument();
  });

  it("moves the focus to the heading of the node a link goes to", () => {
    cleanup();
    function Walked() {
      const [nodeId, setNodeId] = useState(CARD);
      return (
        <GraphNodePane
          instance={instanceA}
          graph={smallGraph()}
          nodeId={nodeId}
          onSelect={setNodeId}
        />
      );
    }
    render(<Walked />);
    const link = within(list("Links from it")).getByRole("button", { name: "sweden-d1" });
    link.focus();
    fireEvent.click(link);
    expect(screen.getByRole("heading", { name: "sweden-d1" })).toHaveFocus();
    const document = screen.getAllByRole("button", { name: "decks/capitals.ttl" })[0]!;
    fireEvent.click(document);
    expect(screen.getByRole("heading", { name: "decks/capitals.ttl" })).toHaveFocus();
  });

  it("says nothing of why for a node read, and no document for a document", () => {
    pane(CATALOG);
    expect(screen.queryByText(/^Not fetched/)).toBeNull();
    expect(screen.queryByText("Defined in")).toBeNull();
  });

  it("lists the first links of many, and all on asking", () => {
    pane(SM.Card, largeGraph(60));
    const to = list("Links to it");
    expect(within(to).getAllByRole("listitem")).toHaveLength(50);
    fireEvent.click(screen.getByRole("button", { name: "Show all 60 links" }));
    expect(within(to).getAllByRole("listitem")).toHaveLength(60);
    // Its button gone, the focus is on the first link it showed.
    expect(within(to).getAllByRole("button")[50]).toHaveFocus();
    expect(screen.queryByRole("button", { name: /^Show all/ })).toBeNull();
  });
});
