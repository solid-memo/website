import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { PreferencesScreen } from "./PreferencesScreen";
import { I18nProvider } from "./i18n";
import { ThemeProvider } from "./theme";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";

function renderScreen(
  overrides: Partial<Parameters<typeof PreferencesScreen>[0]> = {},
) {
  const props = {
    preferences: DEFAULT_PREFERENCES,
    busy: false,
    error: null,
    onSave: vi.fn(),
    ...overrides,
  };
  const view = render(<PreferencesScreen {...props} />);
  return { ...view, props };
}

describe("PreferencesScreen", () => {
  it("advises a small, steady number of new cards", () => {
    renderScreen();
    expect(screen.getByLabelText("New cards per day")).toHaveAccessibleDescription(
      /a high number now piles up reviews later\. Better to start small and be consistent/,
    );
  });

  it("ties each hint to its group or field", () => {
    renderScreen();
    expect(screen.getByRole("group", { name: "Language" })).toHaveAccessibleDescription(/^Takes effect right away, and is kept on this device/);
    expect(screen.getByRole("group", { name: "Appearance" })).toHaveAccessibleDescription(/^Takes effect right away\. Once these preferences are saved/);
    expect(screen.getByLabelText("Developer mode")).toHaveAccessibleDescription(/^Shows developer tools/);
    expect(screen.getByLabelText("Day starts at (hour)")).toHaveAccessibleDescription(
      "An hour from 0 to 23 on the 24-hour clock: a new study day, with new cards and reviews, starts then.",
    );
  });

  it("switches the language right away, without saving", () => {
    const onChoose = vi.fn();
    const onSave = vi.fn();
    render(
      <I18nProvider locale="en" onChoose={onChoose}>
        <PreferencesScreen preferences={DEFAULT_PREFERENCES} busy={false} error={null} onSave={onSave} />
      </I18nProvider>,
    );
    expect(screen.getByRole("radio", { name: "English" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Svenska" }));
    expect(onChoose).toHaveBeenCalledWith("sv");
    fireEvent.click(screen.getByRole("radio", { name: "한국어" }));
    expect(onChoose).toHaveBeenCalledWith("ko");
    fireEvent.click(screen.getByRole("radio", { name: "Deutsch" }));
    expect(onChoose).toHaveBeenCalledWith("de");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("switches the theme right away, and saves the one chosen with the preferences", () => {
    const onChoose = vi.fn();
    const onSave = vi.fn();
    const { container } = render(
      <ThemeProvider choice="dark" onChoose={onChoose}>
        <PreferencesScreen preferences={DEFAULT_PREFERENCES} busy={false} error={null} onSave={onSave} />
      </ThemeProvider>,
    );
    const group = screen.getByRole("group", { name: "Appearance" });
    expect(group).toContainElement(screen.getByRole("radio", { name: "As my browser" }));
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(group).toHaveTextContent("Once these preferences are saved it is kept in your Pod");
    fireEvent.click(screen.getByRole("radio", { name: "As my browser" }));
    expect(onChoose).toHaveBeenCalledWith("system");
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.submit(container.querySelector("form")!);
    expect(onSave).toHaveBeenCalledWith({ ...DEFAULT_PREFERENCES, theme: "dark" });
  });

  it("prefills the current preferences", () => {
    renderScreen({
      preferences: {
        newCardsPerDay: 10,
        maxReviewsPerDay: 50,
        dayBoundaryHour: 2,
        answerScale: "minimal",
        developerMode: true,
        invalidDataPolicy: "block-instance" as const,
        theme: "system",
      },
    });
    expect(screen.getByLabelText("New cards per day")).toHaveValue(10);
    expect(screen.getByLabelText("Max reviews per day")).toHaveValue(50);
    expect(screen.getByLabelText("Day starts at (hour)")).toHaveValue(2);
    expect(screen.getByLabelText("Developer mode")).toBeChecked();
    expect(screen.getByLabelText(/Again · Hard · Good · Easy/)).toBeChecked();
    expect(screen.getByLabelText(/Block the instance/)).toBeChecked();
  });

  it("keeps developer mode off by default", () => {
    renderScreen();
    expect(screen.getByLabelText("Developer mode")).not.toBeChecked();
  });

  it("activates developer mode under Developer settings", () => {
    const { props, container } = renderScreen();
    expect(screen.getByRole("group", { name: "Developer settings" })).toContainElement(
      screen.getByLabelText("Developer mode"),
    );

    fireEvent.click(screen.getByLabelText("Developer mode"));
    fireEvent.submit(container.querySelector("form")!);
    expect(props.onSave).toHaveBeenCalledWith({
      ...DEFAULT_PREFERENCES,
      developerMode: true,
      invalidDataPolicy: "block-subject" as const,
      theme: "system",
    });
  });

  it("switches the answer scale and saves it", () => {
    const { props, container } = renderScreen();
    expect(screen.getByLabelText(/0 to 5 scale/)).toBeChecked();
    // SM-2 is spelled out where it is offered.
    expect(screen.getByText(/^The full grades of SuperMemo-2 \(SM-2\), the method that schedules your reviews/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Again · Hard · Good · Easy/));
    fireEvent.submit(container.querySelector("form")!);

    expect(props.onSave).toHaveBeenCalledWith({
      ...DEFAULT_PREFERENCES,
      answerScale: "minimal",
    });
  });

  it("offers what to do with invalid data, labelled from the vocabulary, and saves the choice", () => {
    const { props, container } = renderScreen();
    const group = screen.getByRole("group", { name: "When data does not conform" });
    expect(group).toContainElement(screen.getByLabelText(/Block the instance/));
    // Setting invalid data aside is the default, and says so.
    expect(screen.getByLabelText(/Set invalid data aside/)).toBeChecked();
    expect(group).toHaveTextContent("Decks with invalid data are set aside until they are repaired; everything else keeps working. The default.");
    expect(group).toHaveTextContent("Any invalid data stops the app from using the instance until it is repaired.");

    fireEvent.click(screen.getByLabelText(/Block the instance/));
    fireEvent.submit(container.querySelector("form")!);

    expect(props.onSave).toHaveBeenCalledWith({
      ...DEFAULT_PREFERENCES,
      invalidDataPolicy: "block-instance",
    });
  });

  it("saves the edited preferences as numbers", () => {
    const { props, container } = renderScreen();
    fireEvent.input(screen.getByLabelText("New cards per day"), {
      target: { value: "15" },
    });
    fireEvent.input(screen.getByLabelText("Max reviews per day"), {
      target: { value: "120" },
    });
    fireEvent.input(screen.getByLabelText("Day starts at (hour)"), {
      target: { value: "0" },
    });
    fireEvent.submit(container.querySelector("form")!);
    expect(props.onSave).toHaveBeenCalledWith({
      newCardsPerDay: 15,
      maxReviewsPerDay: 120,
      dayBoundaryHour: 0,
      answerScale: "sm2",
      developerMode: false,
      invalidDataPolicy: "block-subject" as const,
      theme: "system",
    });
  });

  it("shows busy state and errors", () => {
    renderScreen({ busy: true, error: "save failed" });
    expect(screen.getByLabelText("New cards per day")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText("save failed")).toBeInTheDocument();
  });

  it("speaks Swedish", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <PreferencesScreen preferences={DEFAULT_PREFERENCES} busy={false} error={null} onSave={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { name: "Studieinställningar" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nya kort per dag")).toBeInTheDocument();
    expect(screen.getByLabelText(/Lägg ogiltig data åt sidan/)).toBeChecked();
  });
});
