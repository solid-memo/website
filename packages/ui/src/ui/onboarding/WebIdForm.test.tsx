import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { WebIdForm } from "./WebIdForm";
import { alertTexts, statusTexts } from "../../test/liveRegions";

function renderForm(overrides: Partial<Parameters<typeof WebIdForm>[0]> = {}) {
  const props = {
    busy: false,
    autoFocus: false,
    onSubmit: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  };
  render(<WebIdForm {...props} />);
  return props;
}

function submit(webId: string) {
  fireEvent.input(screen.getByLabelText("WebID"), { target: { value: webId } });
  fireEvent.click(screen.getByRole("button", { name: "Log in with Solid" }));
}

describe("WebIdForm", () => {
  it("starts empty, without someone else's WebID prefilled", () => {
    renderForm();
    expect(screen.getByLabelText("WebID")).toHaveValue("");
  });

  it("submits a valid WebID, normalized", () => {
    const { onSubmit } = renderForm();
    submit("  https://Bob.example/profile/card#me ");
    expect(onSubmit).toHaveBeenCalledWith("https://bob.example/profile/card#me");
  });

  it("rejects a non-https WebID with a message and does not submit", () => {
    const { onSubmit } = renderForm();
    submit("http://bob.example/profile/card#me");

    expect(alertTexts()).toEqual(["A WebID must start with https://."]);
    expect(screen.getByLabelText("WebID")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    // The field says why when the user comes back to it, and has the focus.
    expect(screen.getByLabelText("WebID")).toHaveAccessibleDescription(/^A WebID must start with https:\/\/\. Your WebID is/);
    expect(screen.getByLabelText("WebID")).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("clears the validation message once the user edits the field", () => {
    renderForm();
    submit("nonsense");
    expect(alertTexts()).toHaveLength(1);

    fireEvent.input(screen.getByLabelText("WebID"), {
      target: { value: "https://" },
    });
    expect(alertTexts()).toEqual([]);
    expect(screen.getByLabelText("WebID")).toHaveAccessibleDescription(/^Your WebID is/);
  });

  it("never asks for a password", () => {
    const { container } = render(
      <WebIdForm busy={false} autoFocus={false} onSubmit={vi.fn()} onBack={vi.fn()} />,
    );
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  it("focuses the field on request", () => {
    renderForm({ autoFocus: true });
    expect(screen.getByLabelText("WebID")).toHaveFocus();
  });

  it("leaves focus alone otherwise", () => {
    renderForm();
    expect(screen.getByLabelText("WebID")).not.toHaveFocus();
  });

  it("goes back on request", () => {
    const { onBack } = renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("disables the form and changes the button label while busy, and says so", () => {
    const { onSubmit } = renderForm({ busy: true });
    expect(screen.getByLabelText("WebID")).toBeDisabled();
    // Only aria-disabled, so it keeps the focus while the page redirects.
    const button = screen.getByRole("button", { name: "Redirecting…" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(statusTexts()).toEqual(["Redirecting…"]);
    fireEvent.submit(button.closest("form")!);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
