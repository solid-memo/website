import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { DataClassRegistrations, Instance } from "@solid-memo/domain/instance";
import { FindableContainer } from "./FindableContainer";
import { makeUseCasesFake } from "../test/useCasesFake";

const instance: Instance = { url: "https://pod.example/solid-memo/main/", name: "Main" };
const session = { webId: "https://alice.example/profile/card#me" };

function renderContainer(useCases: UseCases) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <FindableContainer useCases={useCases} session={session} instance={instance} />
    </QueryClientProvider>,
  );
}

const someMissing: DataClassRegistrations = {
  registrations: [
    { dataClass: "instance", index: "public", registered: true },
    { dataClass: "catalog", index: "public", registered: true },
    { dataClass: "deck", index: "public", registered: false },
    { dataClass: "card", index: "public", registered: false },
    { dataClass: "reviewState", index: "private", registered: false },
    { dataClass: "answer", index: "private", registered: true },
  ],
  privateIndexMissing: false,
  unreadableIndexes: [],
};

describe("FindableContainer", () => {
  it("says which registrations of the instance's data are there and which are missing, and adds those on the user's say", async () => {
    const registerDataClasses = vi.fn(async () => undefined);
    const useCases = makeUseCasesFake({
      dataClassRegistrations: vi
        .fn<UseCases["dataClassRegistrations"]>()
        .mockResolvedValueOnce(someMissing)
        .mockResolvedValue({
          registrations: someMissing.registrations.map((registration) => ({ ...registration, registered: true })),
          privateIndexMissing: false,
          unreadableIndexes: [],
        }),
      registerDataClasses,
    });
    renderContainer(useCases);
    const section = await screen.findByRole("region", { name: "Findable by other apps" });
    const items = (await within(section).findAllByRole("listitem")).map((item) => item.textContent);
    expect(items).toEqual([
      "This instance (Solid Memo's folder): in your public type index",
      "Its catalogue of decks: in your public type index",
      "Decks: missing from your public type index",
      "Cards: missing from your public type index",
      "Review states: missing from your private type index",
      "Answers: in your private type index",
    ]);
    expect(useCases.dataClassRegistrations).toHaveBeenCalledWith(session, instance);
    // Nothing is added until asked.
    expect(registerDataClasses).not.toHaveBeenCalled();

    fireEvent.click(within(section).getByRole("button", { name: "Register what is missing" }));
    expect(await within(section).findByText("Everything is registered.")).toBeInTheDocument();
    expect(registerDataClasses).toHaveBeenCalledExactlyOnceWith(session, instance);
    expect(within(section).queryByRole("button")).toBeNull();
    expect(within(section).queryByText(/missing from/)).toBeNull();
  });

  it("says why review states and answers are not registered without a private type index", async () => {
    const useCases = makeUseCasesFake({
      dataClassRegistrations: vi.fn(async () => ({
        registrations: [{ dataClass: "instance" as const, index: "public" as const, registered: true }],
        privateIndexMissing: true,
        unreadableIndexes: [],
      })),
    });
    renderContainer(useCases);
    expect(
      await screen.findByText(/so they are only ever registered in your private type index. You have none/),
    ).toBeInTheDocument();
    expect(screen.getByText("Everything is registered.")).toBeInTheDocument();
  });

  it("says which type index could not be read", async () => {
    const useCases = makeUseCasesFake({
      dataClassRegistrations: vi.fn(async () => ({
        registrations: [{ dataClass: "instance" as const, index: "public" as const, registered: true }],
        privateIndexMissing: false,
        unreadableIndexes: ["private" as const],
      })),
    });
    renderContainer(useCases);
    expect(
      await screen.findByText(
        "Your private type index could not be read, so what it registers is not shown here, and nothing is added to it.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/You have none/)).toBeNull();
  });

  it("says it is reading, and then registering, and shows what went wrong", async () => {
    let fail: (error: Error) => void = () => undefined;
    const useCases = makeUseCasesFake({
      dataClassRegistrations: vi.fn(async () => someMissing),
      registerDataClasses: vi.fn(
        () =>
          new Promise<void>((_, reject) => {
            fail = reject;
          }),
      ),
    });
    renderContainer(useCases);
    expect(screen.getByRole("status")).toHaveTextContent("Reading your type indexes…");
    fireEvent.click(await screen.findByRole("button", { name: "Register what is missing" }));
    expect(await screen.findByRole("button", { name: "Registering…" })).toBeDisabled();
    fail(new Error("The index refused"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The index refused"));
    expect(screen.getByRole("button", { name: "Register what is missing" })).toBeEnabled();
  });

  it("shows why the registrations cannot be read, and no list", async () => {
    const useCases = makeUseCasesFake({
      dataClassRegistrations: vi.fn(async () => {
        throw new Error("403 Forbidden");
      }),
    });
    renderContainer(useCases);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("403 Forbidden"));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
