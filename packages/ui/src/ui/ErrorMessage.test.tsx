import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { ErrorMessage } from "./ErrorMessage";
import { createI18n } from "./i18n";

describe("ErrorMessage", () => {
  it("stays mounted, empty, while there is no error, and says the error in the same alert", () => {
    const { rerender } = render(<ErrorMessage error={null} id="save-error" />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("");
    expect(alert).toHaveAttribute("id", "save-error");
    expect(alert).toHaveClass("error");

    rerender(<ErrorMessage error="write refused" id="save-error" />);
    expect(screen.getByRole("alert")).toBe(alert);
    expect(alert).toHaveTextContent("write refused");

    rerender(<ErrorMessage error={undefined} id="save-error" />);
    expect(alert.textContent).toBe("");
  });

  it("takes focus when the error comes up after focus was lost", () => {
    const { rerender } = render(<ErrorMessage error={null} />);
    (document.activeElement as HTMLElement | null)?.blur();
    rerender(<ErrorMessage error="write refused" />);
    expect(screen.getByRole("alert")).toHaveFocus();
  });

  it("says an error with markup, and takes focus for it once, not on every render", () => {
    const { errorText } = createI18n("sv");
    const { rerender } = render(<ErrorMessage error={null} focus />);
    rerender(<ErrorMessage error={errorText(new Error("broken"))} focus />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveFocus();
    expect(screen.getByText("broken")).toHaveAttribute("lang", "en");
    alert.blur();
    rerender(<ErrorMessage error={errorText(new Error("broken"))} focus />);
    expect(alert).not.toHaveFocus();
  });

  it("leaves focus where the user is, unless told to take it", () => {
    const { rerender } = render(
      <>
        <button>Save</button>
        <ErrorMessage error={null} />
      </>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    button.focus();
    rerender(
      <>
        <button>Save</button>
        <ErrorMessage error="write refused" />
      </>,
    );
    expect(button).toHaveFocus();

    rerender(
      <>
        <button>Save</button>
        <ErrorMessage error="session expired" focus />
      </>,
    );
    expect(screen.getByRole("alert")).toHaveFocus();
  });
});
