import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/preact";
import { StepProgress } from "./StepProgress";

const steps = [
  { step: "one", label: "First" },
  { step: "two", label: "Second" },
] as const;

describe("StepProgress", () => {
  it("marks every step done once all the work is", () => {
    render(
      <StepProgress
        region="Working"
        steps={steps}
        current="two"
        done={2}
        total={2}
        status="Done."
        progressLabel="Progress"
        hint="Keep it open."
      />,
    );
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["✓First (done)", "✓Second (done)"]);
    expect(screen.getByRole("progressbar", { name: "Progress" })).toHaveAttribute("max", "2");
  });

  it("shows a bar of one before the total is known", () => {
    render(
      <StepProgress region="Working" steps={steps} current="one" done={0} total={0} status="Starting." progressLabel="Progress" hint="" />,
    );
    expect(screen.getByRole("progressbar", { name: "Progress" })).toHaveAttribute("max", "1");
    expect(screen.getAllByRole("listitem")[0]).toHaveAttribute("aria-current", "step");
  });

  it("says the first step a frame after the region is up, so screen readers hear it", async () => {
    const { rerender } = render(
      <StepProgress region="Working" steps={steps} current="one" done={0} total={2} status="Starting." progressLabel="Progress" hint="" />,
    );
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");
    await waitFor(() => expect(status).toHaveTextContent("Starting."));
    rerender(
      <StepProgress region="Working" steps={steps} current="two" done={1} total={2} status="Going on." progressLabel="Progress" hint="" />,
    );
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("Going on.");
  });

  it("shows how far into the step it is outside the announced status, so the count is not read out at every unit", async () => {
    render(
      <StepProgress
        region="Working"
        steps={steps}
        current="one"
        done={0}
        total={2}
        part={{ done: 37, total: 412 }}
        status="Copying…"
        progressLabel="Progress"
        hint=""
      />,
    );
    const status = screen.getByRole("status");
    await waitFor(() => expect(status).toHaveTextContent("Copying…"));
    expect(status).not.toHaveTextContent("37");
    expect(screen.getByText("37 of 412")).not.toHaveAttribute("role");
  });

  it("takes the focus as it mounts, as it takes the place of the button that started it", () => {
    render(
      <StepProgress region="Working" steps={steps} current="one" done={0} total={2} status="Starting." progressLabel="Progress" hint="" />,
    );
    expect(screen.getByRole("region", { name: "Working" })).toHaveFocus();
  });
});
