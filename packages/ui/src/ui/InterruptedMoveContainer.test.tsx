import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InterruptedMoveContainer } from "./InterruptedMoveContainer";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import { GUEST_INSTANCE_URL } from "@solid-memo/domain/guest";
import { makeUseCasesFake } from "../test/useCasesFake";

const instance: Instance = { url: GUEST_INSTANCE_URL, name: "Main" };

function renderContainer(useCases: UseCases) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <InterruptedMoveContainer useCases={useCases} instance={instance} />
    </QueryClientProvider>,
  );
}

describe("InterruptedMoveContainer", () => {
  it("shows nothing when no move of the instance was cut off", async () => {
    const useCases = makeUseCasesFake();
    const { container } = renderContainer(useCases);
    await waitFor(() => expect(useCases.findInterruptedGuestMove).toHaveBeenCalledWith(instance));
    expect(container.textContent).toBe("");
  });

  it("offers to remove the partial copy a move cut off half-way left, and says why it could not", async () => {
    let leftover: string | null = "https://pod.example/solid-memo/main/";
    const removeInterruptedGuestMove = vi
      .fn()
      .mockRejectedValueOnce(new Error("not allowed"))
      .mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        leftover = null;
      });
    const useCases = makeUseCasesFake({
      findInterruptedGuestMove: vi.fn(async () => leftover),
      removeInterruptedGuestMove,
    });
    renderContainer(useCases);
    const notice = await screen.findByRole("region", { name: "Interrupted move" });
    expect(notice).toHaveTextContent(
      "Moving Main into your Pod was cut off before it was finished; your study here is as it was. The partial copy remains at https://pod.example/solid-memo/main/.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove it" }));
    expect(await screen.findByText("not allowed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove it" }));
    // Only aria-disabled, so it keeps the focus; pressed again meanwhile, it does nothing.
    const removing = await screen.findByRole("button", { name: "Removing…" });
    expect(removing).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(removing);
    expect(removeInterruptedGuestMove).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Interrupted move" })).toBeNull());
  });
});
