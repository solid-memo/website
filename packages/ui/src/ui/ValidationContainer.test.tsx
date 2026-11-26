// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ValidationContainer } from "./ValidationContainer";
import type { Instance } from "@solid-memo/domain/instance";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { summarize, type ValidationReport } from "@solid-memo/domain/validation";
import { useDataCheck } from "./dataCheck";
import { alertTexts, statusTexts, unexpectedText } from "../test/liveRegions";
import { makeUseCasesFake } from "../test/useCasesFake";

const instance: Instance = { url: "https://pod.example/solid-memo/a/", name: "Main" };

function renderContainer(useCases = makeUseCasesFake()) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
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

  describe("beside the check made as the instance is opened", () => {
    const opening: ValidationReport = summarize(instance.url, []);
    // An answer log month that does not conform: the opening check leaves the answer log out.
    const full: ValidationReport = summarize(instance.url, [
      {
        url: `${instance.url}history/2026-11.ttl`,
        status: "checked",
        subjects: [
          {
            url: `${instance.url}history/2026-11.ttl#a1`,
            status: "checked",
            shape: "answer",
            version: 6,
            violations: [
              {
                message: { en: "Less than 1 values" },
                severity: "violation",
                constraint: "MinCount",
              },
            ],
          },
        ],
      },
    ]);
    let held: () => boolean = () => false;
    function OpenedInstance() {
      const check = useDataCheck(useCases, instance.url);
      held = () => check.report !== null;
      return null;
    }
    let useCases = makeUseCasesFake();

    it("runs the full check, and its report never reaches the opening check", async () => {
      useCases = makeUseCasesFake({
        checkInstance: vi.fn(async () => opening),
        validateInstance: vi.fn(async () => full),
        getPreferences: vi.fn(async () => ({
          ...DEFAULT_PREFERENCES,
          invalidDataPolicy: "block-instance" as const,
        })),
      });
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const { rerender } = render(
        <QueryClientProvider client={client}>
          <OpenedInstance />
        </QueryClientProvider>,
      );
      await waitFor(() => expect(useCases.checkInstance).toHaveBeenCalledOnce());
      rerender(
        <QueryClientProvider client={client}>
          <OpenedInstance />
          <ValidationContainer useCases={useCases} instance={instance} />
        </QueryClientProvider>,
      );
      expect(await screen.findByText(`${instance.url}history/2026-11.ttl`)).toBeInTheDocument();
      expect(useCases.validateInstance).toHaveBeenCalledExactlyOnceWith(instance.url);

      fireEvent.click(await screen.findByRole("button", { name: "Validate again" }));
      await waitFor(() => expect(useCases.validateInstance).toHaveBeenCalledTimes(2));
      expect(await screen.findByRole("button", { name: "Validate again" })).toBeEnabled();
      expect(held()).toBe(false);
      expect(useCases.checkInstance).toHaveBeenCalledOnce();
    });
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
