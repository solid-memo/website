// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { instanceGraphOf, type InstanceGraph } from "@solid-memo/domain/instanceGraph";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { forget } from "@solid-memo/ui/remembered";
import { instanceA } from "../../test/fixtures";
import {
  CARD,
  CARDS,
  crowdedGraph,
  largeGraph,
  REVIEW,
  smallGraph,
  typedGraph,
} from "../../test/graph";
import { WithKeys } from "../../test/keys";
import { searchedText } from "../searchText";
import { GraphScreen } from "./GraphScreen";
import { createLayout } from "./layout";

vi.mock("../searchText", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../searchText")>();
  return { searchedText: vi.fn(actual.searchedText) };
});

vi.mock("./layout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./layout")>();
  return { ...actual, createLayout: vi.fn(actual.createLayout) };
});

function show(graph: InstanceGraph = smallGraph(), selected: string | null = null) {
  const onSelect = vi.fn();
  const view = (selected: string | null) => (
    <WithKeys>
      <GraphScreen instance={instanceA} graph={graph} selected={selected} onSelect={onSelect} />
    </WithKeys>
  );
  const result = render(view(selected));
  return {
    ...result,
    onSelect,
    rerender: (selected: string | null) => result.rerender(view(selected)),
  };
}

const counts = () => screen.getByText(/ shown$/).textContent;
const box = (name: string) => screen.getByRole("checkbox", { name });

afterEach(() => {
  vi.mocked(createLayout).mockClear();
  forget(`studio.graphFilters.${instanceA.url}`);
  forget(`studio.graphLayout.${instanceA.url}`);
});

describe("GraphScreen", () => {
  it("draws the instance's graph once it is laid out, and says how much of it is shown", async () => {
    const graph = smallGraph();
    show(graph);
    expect(screen.getByRole("heading", { name: "Graph of Deck set A" })).toBeInTheDocument();
    expect(screen.getByText("Placing the nodes")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Graph of Deck set A" })).toBeInTheDocument();
    // The vocabulary terms hidden at first.
    const nodes = graph.nodes.filter((node) => node.kind !== "vocabularyLeaf").length;
    const edges = graph.edges.filter((edge) => edge.kind !== "vocabulary").length;
    expect(counts()).toBe(
      `${nodes} of ${graph.nodes.length} nodes and ${edges} of ${graph.edges.length} edges shown`,
    );
    fireEvent.click(box("Vocabulary terms"));
    expect(counts()).toBe(
      `${graph.nodes.length} of ${graph.nodes.length} nodes and ${graph.edges.length} of ${graph.edges.length} edges shown`,
    );
  });

  it("says how many edges to vocabulary terms are drawn only for the node selected or pointed at, unless there are none, or as tables", () => {
    const graph = smallGraph();
    const terms = graph.edges.filter((edge) => edge.kind === "vocabulary").length;
    expect(terms).toBeGreaterThan(1);
    show(graph);
    // None while the vocabulary terms are hidden, as they are at first.
    expect(screen.queryByText(/edges? to (a )?vocabulary terms?/)).toBeNull();
    fireEvent.click(box("Vocabulary terms"));
    const undrawn = `${terms} edges to vocabulary terms are drawn only for the node selected or pointed at.`;
    expect(screen.getByText(undrawn)).toBeInTheDocument();
    fireEvent.click(box("Show as a table"));
    expect(screen.queryByText(undrawn)).toBeNull();
    fireEvent.click(box("Show as a table"));
    fireEvent.click(box("Vocabulary terms"));
    expect(screen.queryByText(/edges? to (a )?vocabulary terms?/)).toBeNull();
  });

  it("selects a node clicked, describing the one pointed at", async () => {
    const { onSelect } = show();
    const img = await screen.findByRole("img");
    const card = [...img.querySelectorAll("[data-node]")].find(
      (shape) => shape.getAttribute("class") === "graph-node kind-resource",
    )!;
    fireEvent.pointerOver(card);
    expect(screen.getByText(/, resource$/)).toBeInTheDocument();
    fireEvent.click(card);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("hides and shows each group of nodes, and keeps the filters for the page's life", async () => {
    const graph = smallGraph();
    show(graph);
    // The vocabulary terms last of the row, after the toggles, and hidden at first.
    expect(screen.getAllByRole("checkbox").map((each) => each.parentElement!.textContent)).toEqual([
      "Cards",
      "Wrong options",
      "Review states",
      "Answers",
      "Leaves",
      "Neighbors only",
      "Show as a table",
      "Vocabulary terms",
    ]);
    expect(box("Vocabulary terms")).not.toBeChecked();
    fireEvent.click(box("Cards"));
    const vocabulary = graph.nodes.filter((node) => node.kind === "vocabularyLeaf").length;
    expect(counts()).toMatch(new RegExp(`^${graph.nodes.length - vocabulary - 1} of `));
    fireEvent.click(box("Vocabulary terms"));
    expect(counts()).toMatch(new RegExp(`^${graph.nodes.length - 1} of `));
    cleanup();
    show(graph);
    expect(box("Vocabulary terms")).toBeChecked();
    expect(box("Cards")).not.toBeChecked();
    fireEvent.click(box("Cards"));
    expect(box("Cards")).toBeChecked();
    for (const name of ["Wrong options", "Review states", "Answers", "Leaves"]) {
      expect(box(name)).toBeChecked();
    }
  });

  it("shows only the node selected and its neighbors, once one is", () => {
    const { rerender } = show(smallGraph(), null);
    fireEvent.click(box("Neighbors only"));
    expect(screen.getByText("Select a node to see only it and its neighbors.")).toBeInTheDocument();
    rerender(CARD);
    expect(screen.queryByText("Select a node to see only it and its neighbors.")).toBeNull();
    expect(counts()).toMatch(/^4 of /);
    // The search finds any node the filters show, not only the neighbors.
    fireEvent.input(screen.getByRole("searchbox"), { target: { value: "catalog.ttl" } });
    expect(screen.getByRole("status")).not.toHaveTextContent(/^No node/);
    fireEvent.input(screen.getByRole("searchbox"), { target: { value: "" } });
    // One of a hidden group still is, with its neighbors.
    fireEvent.click(box("Cards"));
    expect(counts()).toMatch(/^4 of /);
    fireEvent.click(box("Cards"));
    fireEvent.click(box("Neighbors only"));
    // A node the graph has not is none.
    rerender("https://elsewhere.example/nothing");
    expect(counts()).not.toMatch(/^4 of /);
  });

  it("finds nodes by name or address, and selects one", () => {
    const { onSelect } = show();
    const search = screen.getByRole("searchbox", { name: "Find a node" });
    expect(search).toHaveAttribute("aria-keyshortcuts", "/");
    fireEvent.input(search, { target: { value: "SWEDEN" } });
    expect(screen.getByRole("status")).toHaveTextContent("3 nodes found");
    fireEvent.click(screen.getByRole("button", { name: "decks/capitals#sweden" }));
    expect(onSelect).toHaveBeenLastCalledWith(CARD);
    expect(search).toHaveValue("");
    // Its button gone with the list, the focus is back in the search.
    expect(search).toHaveFocus();
    fireEvent.input(search, { target: { value: "reviews/capitals.ttl#" } });
    expect(screen.getByRole("status")).toHaveTextContent("1 node found");
    fireEvent.keyDown(search, { key: "a" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith(REVIEW);
    fireEvent.input(search, { target: { value: "  nothing  " } });
    expect(screen.getByRole("status")).toHaveTextContent("No node shown matches “nothing”.");
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("finds a blank node by its term and its document's address, not the number the graph gives it", () => {
    const graph = smallGraph();
    const blank = graph.nodes.find((node) => node.blank === true)!;
    show(graph);
    const search = screen.getByRole("searchbox", { name: "Find a node" });
    fireEvent.input(search, { target: { value: "_:b0" } });
    expect(screen.getByRole("button", { name: "_:b0" })).toBeInTheDocument();
    fireEvent.input(search, { target: { value: blank.document! } });
    expect(screen.getByRole("button", { name: "_:b0" })).toBeInTheDocument();
    fireEvent.input(search, { target: { value: blank.id } });
    expect(screen.queryByRole("button", { name: "_:b0" })).toBeNull();
  });

  it("matches a node by the start of its address and of its name, folded once, not for each letter", () => {
    const long = `${CARDS}#long-${"é".repeat(16_000)}-tail`;
    const graph = instanceGraphOf({
      instanceUrl: instanceA.url,
      storages: ["https://pod.example/"],
      documents: [
        {
          url: CARDS,
          found: true,
          triples: [
            {
              subject: long,
              predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
              object: { kind: "iri", value: SM.Card },
            },
          ],
        },
      ],
    });
    show(graph);
    const folds = vi.mocked(searchedText).mock.calls.length;
    const search = screen.getByRole("searchbox", { name: "Find a node" });
    for (const typed of ["LONG", "LONG-É", `long-${"e".repeat(100)}`]) {
      fireEvent.input(search, { target: { value: typed } });
      expect(screen.getByRole("status")).toHaveTextContent("1 node found");
    }
    // Typing folds no node again: they were folded when the graph was shown.
    expect(vi.mocked(searchedText).mock.calls.length).toBe(folds);
    // Past the start of its address and of its name, a node is not searched.
    fireEvent.input(search, { target: { value: "e-tail" } });
    expect(screen.getByRole("status")).toHaveTextContent("No node shown matches");
  });

  it("lists the first nodes found, and says how many more there are", () => {
    show(largeGraph(20));
    fireEvent.input(screen.getByRole("searchbox"), { target: { value: "card-1" } });
    // card-1, card-1-d1, and card-10 to card-19 and theirs, with their review states.
    expect(within(screen.getByRole("list")).getAllByRole("button")).toHaveLength(10);
    expect(screen.getByText(/^and \d+ more: type more to narrow them down$/)).toBeInTheDocument();
  });

  it("names a node's first classes in its row, and how many more it has", () => {
    show(crowdedGraph(5_000));
    fireEvent.click(box("Show as a table"));
    const nodes = screen.getByRole("table", { name: "Nodes of the graph" });
    const row = within(nodes)
      .getAllByRole("row")
      .find((each) => within(each).queryByText(CARD) !== null)!;
    const types = within(row).getAllByRole("cell").at(-1)!;
    const named = [0, 1, 2].map((n) => `https://vocab.example/ns#Class${n}`).join(", ");
    expect(types.textContent).toBe(`${named}, and 4,997 more`);
  });

  it("shows the nodes and the edges as tables, a page at a time, a node's name selecting it", () => {
    const { onSelect } = show(largeGraph(60), CARDS);
    fireEvent.click(box("Show as a table"));
    expect(screen.queryByRole("img")).toBeNull();
    const nodes = screen.getByRole("table", { name: "Nodes of the graph" });
    expect(within(nodes).getAllByRole("row")).toHaveLength(101);
    fireEvent.click(within(nodes).getAllByRole("button", { name: "decks/capitals.ttl" })[0]!);
    expect(onSelect).toHaveBeenLastCalledWith(CARDS);
    const pages = screen.getByRole("navigation", { name: "Pages of nodes" });
    fireEvent.click(within(pages).getByRole("button", { name: "Next" }));
    expect(within(pages).getByRole("status")).toHaveTextContent("Page 2 of 2");
    const row = within(nodes)
      .getAllByRole("row")
      .find((each) => /card-59-d1/.test(each.textContent!))!;
    expect(row).toHaveTextContent("sm:Distractor");
    fireEvent.click(within(row).getByRole("button", { name: "decks/capitals.ttl" }));
    expect(onSelect).toHaveBeenLastCalledWith(CARDS);
    const edges = screen.getByRole("table", { name: "Edges of the graph" });
    expect(within(edges).getAllByRole("row")[1]).toHaveTextContent(/ldp:contains/);
    fireEvent.click(within(edges).getAllByRole("button")[0]!);
    expect(onSelect).toHaveBeenCalledTimes(3);
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Pages of edges" })).getByRole("button", {
        name: "Next",
      }),
    );
    expect(
      within(edges)
        .getAllByRole("row")
        .some((each) => /defines/.test(each.textContent!)),
    ).toBe(true);
    // Enter opens the node at the cursor, as its name does.
    document.body.focus();
    fireEvent.keyDown(document.body, { key: "j" });
    document.body.focus();
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(4);
  });

  it("does not lay out or draw a graph too large to draw smoothly until asked, and never leaves a node out unsaid", () => {
    const graph = largeGraph(7000);
    show(graph);
    expect(screen.queryByRole("img")).toBeNull();
    const many = (count: number) => count.toLocaleString("en");
    expect(
      screen.getByText(
        `The graph has ${many(graph.nodes.length)} nodes and ${many(graph.edges.length)} edges, too many for the page to lay out and draw smoothly, even with the filters hiding some. Show it as a table, or draw it anyway.`,
      ),
    ).toBeInTheDocument();
    // Nor says what of it is drawn for the node selected alone.
    fireEvent.click(box("Vocabulary terms"));
    const undrawn = /vocabulary terms are drawn only/;
    expect(screen.queryByText(undrawn)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Draw anyway" }));
    expect(screen.getByText(undrawn)).toBeInTheDocument();
    expect(screen.getByText("Placing the nodes")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "0");
  });

  it("weighs the whole graph, the nodes and edges the filters hide too, as all of them are laid out", async () => {
    // Few nodes shown, and tens of thousands of edges to vocabulary terms hidden.
    const graph = crowdedGraph(30_001);
    show(graph);
    expect(counts()).toMatch(/^\d of [\d,]+ nodes and \d of [\d,]+ edges shown$/);
    expect(screen.getByRole("button", { name: "Draw anyway" })).toBeInTheDocument();
    // Hiding more makes it no smaller to lay out.
    fireEvent.click(box("Wrong options"));
    expect(screen.getByRole("button", { name: "Draw anyway" })).toBeInTheDocument();
    expect(screen.queryByText("Placing the nodes")).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(createLayout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Draw anyway" }));
    expect(screen.getByText("Placing the nodes")).toBeInTheDocument();
  });

  it("weighs the edges alone: a graph of few nodes and a great many hidden edges to vocabulary terms is not laid out until asked", async () => {
    const graph = typedGraph(2_000, 31);
    expect(graph.nodes.length).toBeLessThan(20_000);
    expect(graph.edges.filter((edge) => edge.kind === "vocabulary").length).toBeGreaterThan(60_000);
    show(graph);
    // The vocabulary terms, and their edges, hidden as they are at first.
    expect(counts()).toMatch(/^[\d,]+ of [\d,]+ nodes and [\d,]+ of [\d,]+ edges shown$/);
    expect(screen.getByRole("button", { name: "Draw anyway" })).toBeInTheDocument();
    expect(screen.queryByText("Placing the nodes")).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(createLayout).not.toHaveBeenCalled();
  });

  it("asks again for another graph too large, once one was drawn anyway", async () => {
    const view = (graph: InstanceGraph, selected: string | null = null) => (
      <WithKeys>
        <GraphScreen instance={instanceA} graph={graph} selected={selected} onSelect={vi.fn()} />
      </WithKeys>
    );
    const first = largeGraph(7000);
    const { rerender } = render(view(first));
    fireEvent.click(screen.getByRole("button", { name: "Draw anyway" }));
    expect(screen.getByText("Placing the nodes")).toBeInTheDocument();
    // The same graph stays drawn, whatever node is selected.
    rerender(view(first, CARD));
    expect(screen.getByText("Placing the nodes")).toBeInTheDocument();
    // A larger one, read later, is weighed afresh.
    vi.mocked(createLayout).mockClear();
    rerender(view(largeGraph(8000)));
    expect(screen.getByRole("button", { name: "Draw anyway" })).toBeInTheDocument();
    expect(screen.queryByText("Placing the nodes")).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(createLayout).not.toHaveBeenCalled();
  });
});
