import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { RegistrationTargetChooser } from "./RegistrationTargetChooser";

describe("RegistrationTargetChooser", () => {
  it("shows no warning while options are loading", () => {
    render(
      <RegistrationTargetChooser
        options={null}
        value="private"
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByText(/no private type index/i)).toBeNull();
  });

  it("shows no warning when the private index exists", () => {
    render(
      <RegistrationTargetChooser
        options={{ privateIndexExists: true, publicIndexExists: true }}
        value="private"
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByText(/no private type index/i)).toBeNull();
    // What a type index is describes the group alone.
    expect(screen.getByRole("group", { name: "Register in" })).toHaveAccessibleDescription(
      "A type index is a list in your profile that tells apps where your data is. Only you can see a private one.",
    );
    expect(screen.getByLabelText("Private type index")).toBeChecked();
  });

  it("warns and marks indexes that will be created", () => {
    render(
      <RegistrationTargetChooser
        options={{ privateIndexExists: false, publicIndexExists: false }}
        value="private"
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/no private type index yet/i),
    ).toBeInTheDocument();
    // The warning describes the group, heard on tabbing to a choice.
    expect(screen.getByRole("group", { name: "Register in" })).toHaveAccessibleDescription(
      /^A type index is a list in your profile.*no private type index yet/i,
    );
    expect(
      screen.getByLabelText("Private type index (will be created)"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Public type index (will be created)"),
    ).toBeInTheDocument();
  });

  it("notifies on selection changes", () => {
    const onChange = vi.fn();
    render(
      <RegistrationTargetChooser
        options={{ privateIndexExists: true, publicIndexExists: true }}
        value="private"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Public type index"));
    expect(onChange).toHaveBeenCalledWith("public");
    fireEvent.click(screen.getByLabelText("Private type index"));
    expect(onChange).toHaveBeenCalledWith("private");
  });
});
