import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { I18nProvider } from "./i18n";
import { ThemeProvider } from "./theme";
import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  it("shows a sun in the light theme, offering the dark one, outside a provider too", () => {
    const { container } = render(<ThemeToggle />);
    const toggle = screen.getByRole("button", { name: "Switch to dark mode" });
    expect(toggle).toHaveAttribute("title", "Switch to dark mode");
    expect(container.querySelector("circle")).not.toBeNull();
    expect(() => fireEvent.click(toggle)).not.toThrow();
  });

  it("turns the dark theme on", () => {
    const onChoose = vi.fn();
    render(
      <ThemeProvider choice="light" onChoose={onChoose}>
        <ThemeToggle />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onChoose).toHaveBeenCalledWith("dark");
  });

  it("shows a moon in the dark theme, offering the light one in the user's language", () => {
    const onChoose = vi.fn();
    const { container } = render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <ThemeProvider choice="dark" onChoose={onChoose}>
          <ThemeToggle />
        </ThemeProvider>
      </I18nProvider>,
    );
    const toggle = screen.getByRole("button", { name: "Byt till ljust läge" });
    expect(toggle).toHaveAttribute("title", "Byt till ljust läge");
    expect(container.querySelector("circle")).toBeNull();
    fireEvent.click(toggle);
    expect(onChoose).toHaveBeenCalledWith("light");
  });

  it("shows the browser's theme while the choice is the browser's, and chooses the other", () => {
    const onChoose = vi.fn();
    render(
      <ThemeProvider choice="system" preferred="dark" onChoose={onChoose}>
        <ThemeToggle />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(onChoose).toHaveBeenCalledWith("light");
  });
});
