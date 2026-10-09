import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { defaultCatalogDescription, renamedCatalog, type Catalog } from "@solid-memo/domain/catalog";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { InstanceAboutContainer } from "./InstanceAboutContainer";
import { choose } from "../test/choose";
import { instanceA, invalidReport, session } from "../test/fixtures";

const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
const catalog: Catalog = {
  title: "Deck set A",
  description: "My decks.",
  publisher: { webId: session.webId, name: "Alice" },
};

function renderContainer(useCases: UseCases) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <InstanceAboutContainer useCases={useCases} session={session} instance={instanceA} healthHref="#/health" />
    </QueryClientProvider>,
  );
  return { invalidate };
}

describe("InstanceAboutContainer", () => {
  it("shows where the instance is, who publishes its catalogue, and its preferences in Solid Memo", async () => {
    renderContainer(makeUseCasesFake({ readCatalog: vi.fn(async () => catalog) }));
    expect(screen.getByText("Loading the catalogue…")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Instance: Deck set A" })).toBeInTheDocument();
    const [address, publisher] = screen.getAllByRole("definition");
    expect(address).toHaveTextContent(instanceA.url);
    expect(publisher).toHaveTextContent(`Alice (${session.webId}`);
    expect(screen.getByRole("link", { name: "Study preferences in Solid Memo" })).toHaveAttribute(
      "href",
      `#/preferences?instance=${encodeURIComponent(instanceA.url)}`,
    );
    expect(screen.getByLabelText("Description")).toHaveValue("My decks.");
    expect(screen.getByRole("combobox", { name: "Licence" })).toHaveValue("");
  });

  it("holds both forms while the catalogue is set aside, with a link to the health", async () => {
    renderContainer(makeUseCasesFake({ readCatalog: vi.fn(async () => catalog), checkInstance: vi.fn(async () => invalidReport([], { catalogue: true })) }));
    expect(await screen.findByText(/catalogue or one of its groups has invalid data/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Repair it on the health screen." })).toHaveAttribute("href", "#/health");
    expect(screen.getByRole("button", { name: "Save name" })).toBeDisabled();
    expect(screen.getByLabelText("Description")).toBeDisabled();
  });

  it("renames the instance, then reads the instances and the catalogue afresh", async () => {
    const useCases = makeUseCasesFake({ readCatalog: vi.fn(async () => catalog) });
    const { invalidate } = renderContainer(useCases);
    fireEvent.input(await screen.findByLabelText("Instance name"), { target: { value: "Languages" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(useCases.renameInstance).toHaveBeenCalledWith(session, instanceA, "Languages"));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["instances"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["catalog", instanceA.url] });
  });

  it("saves the catalogue as the rename left it, its description naming the new name", async () => {
    let stored: Catalog = { ...catalog, description: defaultCatalogDescription("Deck set A") };
    const useCases = makeUseCasesFake({
      readCatalog: vi.fn(async () => stored),
      renameInstance: vi.fn(async (_session, instance, name) => {
        stored = renamedCatalog(stored, name);
        return { ...instance, name };
      }),
    });
    renderContainer(useCases);
    fireEvent.input(await screen.findByLabelText("Instance name"), { target: { value: "Languages" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(screen.getByLabelText("Description")).toHaveValue(defaultCatalogDescription("Languages")));
    choose("Licence", CC0);
    fireEvent.click(screen.getByRole("button", { name: "Save catalogue" }));
    await waitFor(() =>
      expect(useCases.describeCatalog).toHaveBeenCalledWith(instanceA.url, { description: defaultCatalogDescription("Languages"), license: CC0 }),
    );
  });

  it("gives the catalogue a description and a licence, and says why one is refused", async () => {
    const useCases = makeUseCasesFake({ readCatalog: vi.fn(async () => catalog) });
    renderContainer(useCases);
    fireEvent.input(await screen.findByLabelText("Description"), { target: { value: " " } });
    choose("Licence", CC0);
    fireEvent.click(screen.getByRole("button", { name: "Save catalogue" }));
    expect(await screen.findByText("The catalogue needs a description.")).toBeInTheDocument();
    fireEvent.input(screen.getByLabelText("Description"), { target: { value: "Decks I share." } });
    fireEvent.click(screen.getByRole("button", { name: "Save catalogue" }));
    await waitFor(() => expect(useCases.describeCatalog).toHaveBeenLastCalledWith(instanceA.url, { description: "Decks I share.", license: CC0 }));
    choose("Licence", "");
    fireEvent.click(screen.getByRole("button", { name: "Save catalogue" }));
    await waitFor(() => expect(useCases.describeCatalog).toHaveBeenLastCalledWith(instanceA.url, { description: "Decks I share." }));
  });

  it("says an instance has no catalogue yet", async () => {
    renderContainer(makeUseCasesFake({ readCatalog: vi.fn(async () => null) }));
    expect(await screen.findByText("This instance has no catalogue yet. Open it in Solid Memo to update it.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Description")).toBeNull();
    expect(screen.getByLabelText("Instance name")).toHaveValue("Deck set A");
  });

  it("says why the catalogue could not be read", async () => {
    renderContainer(
      makeUseCasesFake({
        readCatalog: vi.fn(async () => {
          throw new Error("Catalog unreadable");
        }),
      }),
    );
    expect(await screen.findByText("Catalog unreadable")).toBeInTheDocument();
  });
});
