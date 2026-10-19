// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/preact";
import type { ComponentChildren } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UseCases } from "@solid-memo/application/useCases";
import type { InstanceGraph } from "@solid-memo/domain/instanceGraph";
import { forget } from "@solid-memo/ui/remembered";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { instanceA, session } from "../../test/fixtures";
import { CARD, smallGraph } from "../../test/graph";
import { RevealAside } from "../shell/revealAside";
import { GraphContainer, GraphNodeContainer, graphKey } from "./GraphContainer";

function withClient(client: QueryClient, children: ComponentChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const freshClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderContainer(
  useCases: UseCases,
  client = freshClient(),
  onSelect: (id: string | null) => void = vi.fn(),
) {
  render(
    withClient(
      client,
      <GraphContainer
        useCases={useCases}
        instance={instanceA}
        webId={session.webId}
        selected={null}
        onSelect={onSelect}
      />,
    ),
  );
  return client;
}

/** Selects the card by the search, once the graph is read. */
async function selectCard() {
  fireEvent.input(await screen.findByRole("searchbox"), { target: { value: "sweden" } });
  fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Enter" });
}

afterEach(() => {
  forget(`studio.graphFilters.${instanceA.url}`);
  forget(`studio.graphLayout.${instanceA.url}`);
});

describe("GraphContainer", () => {
  it("reads the instance as the user's graph, saying how many documents it has read", async () => {
    let tell: (read: number, total: number) => void = () => undefined;
    let finish: (graph: InstanceGraph) => void = () => undefined;
    const readInstanceGraph = vi.fn(
      (_instanceUrl: string, _webId: string, options?: { onProgress?: typeof tell }) => {
        tell = options!.onProgress!;
        return new Promise<InstanceGraph>((resolve) => {
          finish = resolve;
        });
      },
    );
    renderContainer(makeUseCasesFake({ readInstanceGraph }));
    expect(screen.getByText("Reading the instance…")).toBeInTheDocument();
    await vi.waitFor(() => expect(readInstanceGraph).toHaveBeenCalled());
    expect(readInstanceGraph.mock.calls[0]!.slice(0, 2)).toEqual([instanceA.url, session.webId]);
    act(() => tell(3, 7));
    expect(screen.getByText("Reading the instance: 3 of 7 documents…")).toBeInTheDocument();
    await act(async () => finish(smallGraph()));
    expect(await screen.findByRole("heading", { name: "Graph of Deck set A" })).toBeInTheDocument();
  });

  it("selects a node", async () => {
    const onSelect = vi.fn();
    renderContainer(
      makeUseCasesFake({ readInstanceGraph: vi.fn(async () => smallGraph()) }),
      freshClient(),
      onSelect,
    );
    await selectCard();
    expect(onSelect).toHaveBeenLastCalledWith(CARD);
  });

  it("asks for the aside to be seen as a node is selected, as the shell provides, but not as it is let go of", async () => {
    const revealAside = vi.fn();
    const onSelect = vi.fn();
    const client = freshClient();
    const useCases = makeUseCasesFake({ readInstanceGraph: vi.fn(async () => smallGraph()) });
    const container = (selected: string | null) =>
      withClient(
        client,
        <RevealAside.Provider value={revealAside}>
          <GraphContainer
            useCases={useCases}
            instance={instanceA}
            webId={session.webId}
            selected={selected}
            onSelect={onSelect}
          />
        </RevealAside.Provider>,
      );
    const { rerender } = render(container(null));
    await selectCard();
    expect(revealAside).toHaveBeenCalledTimes(1);
    rerender(container(CARD));
    fireEvent.click(await screen.findByRole("img", { name: "Graph of Deck set A" }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(revealAside).toHaveBeenCalledTimes(1);
  });

  it("says why the graph could not be read", async () => {
    renderContainer(
      makeUseCasesFake({
        readInstanceGraph: vi.fn(async () => {
          throw new Error("offline");
        }),
      }),
    );
    expect(await screen.findByText(/offline/)).toBeInTheDocument();
  });
});

describe("GraphNodeContainer", () => {
  it("shows the node selected from the graph the screen read, never reading it itself", async () => {
    const client = freshClient();
    const view = (
      <GraphNodeContainer
        instance={instanceA}
        webId={session.webId}
        nodeId={CARD}
        onSelect={vi.fn()}
      />
    );
    render(withClient(client, view));
    expect(screen.getByText("Select a node in the graph to see what it says.")).toBeInTheDocument();
    act(() => {
      client.setQueryData(graphKey(instanceA.url, session.webId), smallGraph());
    });
    expect(
      await screen.findByRole("heading", { name: "decks/capitals#sweden" }),
    ).toBeInTheDocument();
  });
});
