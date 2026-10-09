import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { DeckCreatorScreen } from "./DeckCreatorScreen";
import { recentLanguages, rememberLanguage } from "./remembered";

beforeEach(() => localStorage.clear());

function renderScreen(
  overrides: Partial<Parameters<typeof DeckCreatorScreen>[0]> = {},
) {
  const props = {
    busy: false,
    error: null,
    onCreate: vi.fn(),
    ...overrides,
  };
  const view = render(<DeckCreatorScreen {...props} />);
  return { ...view, props };
}

describe("DeckCreatorScreen", () => {
  it("creates a deck with a trimmed name, in the language chosen for it", () => {
    const { props, container } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Language: not stated" }));
    fireEvent.click(screen.getByRole("radio", { name: "English (en)" }));
    fireEvent.input(screen.getByLabelText("Name"), {
      target: { value: " Kana " },
    });
    fireEvent.submit(container.querySelector("form")!);
    expect(props.onCreate).toHaveBeenCalledWith({ en: "Kana" });
  });

  it("asks for the name's language rather than guess it, at its picker", () => {
    const { props, container } = renderScreen();
    fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Kana" } });
    fireEvent.submit(container.querySelector("form")!);
    expect(props.onCreate).not.toHaveBeenCalled();
    const picker = screen.getByRole("button", { name: "Language: not stated" });
    expect(picker).toHaveFocus();
    expect(picker).toHaveAttribute("aria-invalid", "true");
    expect(picker).toHaveAccessibleDescription("Choose the language of the deck's name.");
    fireEvent.click(picker);
    fireEvent.click(screen.getByRole("radio", { name: "Swedish — svenska (sv)" }));
    expect(document.getElementById("deck-creator-error")).toHaveTextContent("");
    fireEvent.submit(container.querySelector("form")!);
    expect(props.onCreate).toHaveBeenCalledWith({ sv: "Kana" });
    // Chosen once, it is this device's first choice for the next deck.
    expect(recentLanguages("deck")).toEqual(["sv"]);
  });

  it("starts the name in the language last chosen for a deck's text on this device", () => {
    rememberLanguage("deck", "fi");
    const { props, container } = renderScreen();
    expect(screen.getByLabelText("Name")).toHaveAttribute("lang", "fi");
    expect(screen.getByLabelText("Name")).toHaveAttribute("placeholder", "My new deck");
    fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Sanasto" } });
    fireEvent.submit(container.querySelector("form")!);
    expect(props.onCreate).toHaveBeenCalledWith({ fi: "Sanasto" });
  });

  it("disables the form while busy and shows errors", () => {
    renderScreen({ busy: true, error: "create failed" });
    expect(screen.getByLabelText("Name")).toBeDisabled();
    // Only aria-disabled, so the button pressed keeps the focus.
    expect(screen.getByRole("button", { name: "Create deck" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("create failed")).toBeInTheDocument();
  });

  it("ignores a submit while it creates", () => {
    const { props, container } = renderScreen({ busy: true });
    fireEvent.submit(container.querySelector("form")!);
    expect(props.onCreate).not.toHaveBeenCalled();
  });
});
