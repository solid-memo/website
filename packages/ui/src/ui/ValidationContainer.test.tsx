import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ValidationContainer } from "./ValidationContainer";
import type { Instance } from "@solid-memo/domain/instance";
import { alertTexts, statusTexts, unexpectedText } from "../test/liveRegions";
import { makeUseCasesFake } from "../test/useCasesFake";

const instance: Instance = { url: "https://pod.example/solid-memo/a/", name: "Main" };

function renderContainer(useCases = makeUseCasesFake()) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ValidationContainer useCases={useCases} instance={instance} />
    </QueryClientProvider>,
  );
  return useCases;
}

describe("ValidationContainer", () => {
  it("validates the instance and shows the report, again on request", async () => {
    const useCases = renderContainer();
    expect(screen.getByRole("heading", { name: "Validation of Main" })).toBeInTheDocument();
    // The summary line is there, empty, before the report is: screen readers hear it filled.
    expect(statusTexts()).toEqual(["Validating…"]);
    const summary = screen.getAllByRole("status").find((element) => element.textContent === "")!;
    expect(await screen.findByText("All 0 documents conform.")).toBe(summary);
    expect(summary).toHaveClass("hint");
    expect(useCases.validateInstance).toHaveBeenCalledExactlyOnceWith(instance.url);

    let finish!: () => void;
    const report = await vi.mocked(useCases.validateInstance).mock.results[0]!.value;
    vi.mocked(useCases.validateInstance).mockImplementationOnce(
      () => new Promise((resolve) => (finish = () => resolve(report))),
    );
    fireEvent.click(screen.getByRole("button", { name: "Validate again" }));
    await waitFor(() => expect(summary.textContent).toBe(""));
    finish();
    expect(await screen.findByRole("button", { name: "Validate again" })).toBeEnabled();
    expect(summary).toHaveTextContent("All 0 documents conform.");
    expect(useCases.validateInstance).toHaveBeenCalledTimes(2);
  });

  it("shows the error when the check fails", async () => {
    renderContainer(
      makeUseCasesFake({
        validateInstance: vi.fn(async () => {
          throw new Error("pod unreachable");
        }),
      }),
    );
    await waitFor(() => expect(alertTexts()).toEqual([unexpectedText("pod unreachable")]));
  });
});
