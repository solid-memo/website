import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { Switch } from "./Switch";

describe("Switch", () => {
  it("turns on", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} label="Sound" onChange={onChange} />);
    const toggle = screen.getByRole("switch", { name: "Sound" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("turns off, its knob showing what it carries", () => {
    const onChange = vi.fn();
    render(
      <Switch checked label="Sound" onChange={onChange}>
        <svg data-testid="knob-icon" />
      </Switch>,
    );
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("knob-icon")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
