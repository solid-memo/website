// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { PreferencesScreen } from "./PreferencesScreen";
import { I18nProvider } from "./i18n";
import { ThemeProvider } from "./theme";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { PALETTES } from "@solid-memo/domain/palette";
import type { CustomPalette } from "@solid-memo/domain/customPalette";
import { routeToHash } from "./router";
import { TEXT_SCALES, TEXT_SIZES } from "@solid-memo/domain/textSize";

const INSTANCE = "https://pod.example/solid-memo/main/";

function renderScreen(overrides: Partial<Parameters<typeof PreferencesScreen>[0]> = {}) {
  const props = {
    instanceUrl: INSTANCE,
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
    expect(screen.getByRole("group", { name: "Language" })).toHaveAccessibleDescription(
      /^Takes effect right away, and is kept on this device/,
    );
    expect(screen.getByRole("group", { name: "Appearance" })).toHaveAccessibleDescription(
      /^Takes effect right away\. Once these preferences are saved/,
    );
    expect(screen.getByLabelText("Developer mode")).toHaveAccessibleDescription(
      /^Shows developer tools/,
    );
    expect(screen.getByLabelText("Day starts at (hour)")).toHaveAccessibleDescription(
      "An hour from 0 to 23 on the 24-hour clock: a new study day, with new cards and reviews, starts then.",
    );
  });

  it("switches the language right away, without saving", () => {
    const onChoose = vi.fn();
    const onSave = vi.fn();
    render(
      <I18nProvider locale="en" onChoose={onChoose}>
        <PreferencesScreen
          instanceUrl={INSTANCE}
          preferences={DEFAULT_PREFERENCES}
          busy={false}
          error={null}
          onSave={onSave}
        />
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
        <PreferencesScreen
          instanceUrl={INSTANCE}
          preferences={DEFAULT_PREFERENCES}
          busy={false}
          error={null}
          onSave={onSave}
        />
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

  describe("colors and text size", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    /** The browser asking for more contrast or not, a wish it can change. */
    function contrastQuery(moreContrast: boolean) {
      const listeners = new Set<() => void>();
      vi.spyOn(window, "matchMedia").mockImplementation(
        (query) =>
          ({
            get matches() {
              return moreContrast && query === "(prefers-contrast: more)";
            },
            addEventListener: (_: string, listener: () => void) => listeners.add(listener),
            removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
          }) as unknown as MediaQueryList,
      );
      return {
        change(now: boolean) {
          moreContrast = now;
          act(() => listeners.forEach((listener) => listener()));
        },
        listeners,
      };
    }

    /** The screen in a palette and at a text size, the browser asking for more contrast or not. */
    function renderAppearance(moreContrast = false) {
      const contrast = contrastQuery(moreContrast);
      const choosePalette = vi.fn();
      const chooseTextSize = vi.fn();
      const onSave = vi.fn();
      const view = render(
        <ThemeProvider
          choice="system"
          onChoose={() => undefined}
          palette="color-vision"
          onChoosePalette={choosePalette}
          textSize="larger"
          onChooseTextSize={chooseTextSize}
        >
          <PreferencesScreen
            instanceUrl={INSTANCE}
            preferences={DEFAULT_PREFERENCES}
            busy={false}
            error={null}
            onSave={onSave}
          />
        </ThemeProvider>,
      );
      return { ...view, contrast, choosePalette, chooseTextSize, onSave };
    }

    it("switches the palette right away, each shown in its own colors, without saving", () => {
      const { container, choosePalette, onSave } = renderAppearance();
      const group = screen.getByRole("group", { name: "Colors" });
      expect(group).toHaveAccessibleDescription(
        /^Takes effect right away, in the light theme and the dark\. Once these preferences are saved it is kept in your Pod/,
      );
      expect(
        within(group)
          .getAllByRole("radio")
          .map((radio) => radio.getAttribute("value")),
      ).toEqual([...PALETTES]);
      expect(screen.getByRole("radio", { name: /^Color-blind friendly/ })).toBeChecked();
      expect(screen.getByRole("radio", { name: /^Standard/ })).toHaveAccessibleName(
        "Standard The usual colors, the answer buttons from red to green.",
      );
      const swatches = [...container.querySelectorAll(".palette-swatch")];
      expect(swatches.map((swatch) => swatch.getAttribute("data-palette"))).toEqual([...PALETTES]);
      for (const swatch of swatches) expect(swatch).toHaveAttribute("aria-hidden", "true");
      fireEvent.click(screen.getByRole("radio", { name: /^High contrast/ }));
      expect(choosePalette).toHaveBeenCalledWith("high-contrast");
      expect(onSave).not.toHaveBeenCalled();
    });

    it("points to High contrast when the browser asks for more contrast", () => {
      renderAppearance(true);
      expect(screen.getByRole("group", { name: "Colors" })).toHaveAccessibleDescription(
        /^Your device asks for more contrast: High contrast may suit you\. Takes effect right away/,
      );
    });

    it("shows the hint or takes it away as the browser's wish changes", async () => {
      const { contrast, unmount } = renderAppearance();
      contrast.change(true);
      expect(screen.getByText(/asks for more contrast/)).toBeInTheDocument();
      contrast.change(false);
      expect(screen.queryByText(/asks for more contrast/)).toBeNull();
      expect(screen.getByRole("group", { name: "Colors" })).toHaveAccessibleDescription(
        /^Takes effect right away/,
      );
      unmount();
      await waitFor(() => expect(contrast.listeners.size).toBe(0));
    });

    it("saves the palette and the text size shown with the preferences", () => {
      const { container, onSave } = renderAppearance();
      fireEvent.submit(container.querySelector("form")!);
      expect(onSave).toHaveBeenCalledWith({
        ...DEFAULT_PREFERENCES,
        palette: "https://solid-memo.com/ns/vocab/v1.ttl#colorVisionPalette",
        textSize: "larger",
      });
    });

    it("keeps a palette this version does not know while Standard is shown", () => {
      const onSave = vi.fn();
      const preferences = {
        ...DEFAULT_PREFERENCES,
        palette: "https://solid-memo.com/ns/vocab/v1.ttl#sepiaPalette",
      };
      const { container } = render(
        <ThemeProvider choice="system" onChoose={() => undefined}>
          <PreferencesScreen
            instanceUrl={INSTANCE}
            preferences={preferences}
            busy={false}
            error={null}
            onSave={onSave}
          />
        </ThemeProvider>,
      );
      expect(screen.getByRole("radio", { name: /^Standard/ })).toBeChecked();
      fireEvent.submit(container.querySelector("form")!);
      expect(onSave).toHaveBeenCalledWith(preferences);
    });

    it("says nothing of it otherwise", () => {
      renderAppearance();
      expect(screen.queryByText(/asks for more contrast/)).toBeNull();
    });

    it("leaves the hint out once High contrast is chosen", () => {
      contrastQuery(true);
      render(
        <ThemeProvider choice="system" onChoose={() => undefined} palette="high-contrast">
          <PreferencesScreen
            instanceUrl={INSTANCE}
            preferences={DEFAULT_PREFERENCES}
            busy={false}
            error={null}
            onSave={vi.fn()}
          />
        </ThemeProvider>,
      );
      expect(screen.queryByText(/asks for more contrast/)).toBeNull();
    });

    describe("of the user's own", () => {
      const READING: CustomPalette = {
        url: `${INSTANCE}palettes.ttl#palette-reading`,
        title: { en: "Reading" },
        basedOn: "parchment",
        light: { "--bg": "#f4ecd8", "--text": "url(x)" } as CustomPalette["light"],
        dark: {},
      };

      function renderOwn(customPalette: CustomPalette | null) {
        contrastQuery(customPalette !== null);
        const choosePalette = vi.fn();
        const chooseCustomPalette = vi.fn();
        const onSave = vi.fn();
        const view = render(
          <ThemeProvider
            choice="light"
            onChoose={() => undefined}
            palette="parchment"
            customPalette={customPalette}
            onChoosePalette={choosePalette}
            onChooseCustomPalette={chooseCustomPalette}
          >
            <PreferencesScreen
              instanceUrl={INSTANCE}
              preferences={DEFAULT_PREFERENCES}
              palettes={[READING]}
              busy={false}
              error={null}
              onSave={onSave}
            />
          </ThemeProvider>,
        );
        return { ...view, choosePalette, chooseCustomPalette, onSave };
      }

      it("offers each beside the built-in ones, in its own colors, with a link to edit it", () => {
        const { container, chooseCustomPalette } = renderOwn(null);
        const radio = screen.getByRole("radio", { name: /^Reading/ });
        expect(radio).toHaveAccessibleName(
          "Reading Your own colors, based on Parchment (low glare).",
        );
        expect(radio).not.toBeChecked();
        expect(screen.getByRole("radio", { name: /^Parchment/ })).toBeChecked();
        const swatch = container.querySelectorAll<HTMLElement>(".palette-swatch")[4]!;
        expect(swatch).toHaveAttribute("data-palette", "parchment");
        // Only a color written #rrggbb reaches the style.
        expect(swatch.style.getPropertyValue("--bg")).toBe("#f4ecd8");
        expect(swatch.style.getPropertyValue("--text")).toBe("");
        expect(screen.getByRole("link", { name: "Edit Reading" })).toHaveAttribute(
          "href",
          routeToHash({ screen: "palette", instanceUrl: INSTANCE, paletteUrl: READING.url }),
        );
        expect(screen.getByRole("link", { name: "Design a palette" })).toHaveAttribute(
          "href",
          routeToHash({ screen: "palette", instanceUrl: INSTANCE }),
        );
        fireEvent.click(radio);
        expect(chooseCustomPalette).toHaveBeenCalledWith(READING);
      });

      it("saves the one shown with the preferences, and goes back to Standard with Reset colors", () => {
        const { container, onSave, choosePalette } = renderOwn(READING);
        expect(screen.getByRole("radio", { name: /^Reading/ })).toBeChecked();
        expect(screen.getByRole("radio", { name: /^Parchment/ })).not.toBeChecked();
        // Shown over a base, it is no High contrast: the hint stays.
        expect(screen.getByText(/asks for more contrast/)).toBeInTheDocument();
        fireEvent.submit(container.querySelector("form")!);
        expect(onSave).toHaveBeenCalledWith({
          ...DEFAULT_PREFERENCES,
          theme: "light",
          palette: READING.url,
        });
        const reset = screen.getByRole("button", { name: "Reset colors" });
        expect(reset.closest("[data-palette]")).toHaveAttribute("data-palette", "standard");
        fireEvent.click(reset);
        expect(choosePalette).toHaveBeenCalledWith("standard");
      });
    });

    it("saves a built-in palette shown over one of the user's own the preferences hold", () => {
      const onSave = vi.fn();
      const preferences = { ...DEFAULT_PREFERENCES, palette: `${INSTANCE}palettes.ttl#palette-x` };
      const { container } = render(
        <ThemeProvider choice="light" onChoose={() => undefined}>
          <PreferencesScreen
            instanceUrl={INSTANCE}
            preferences={preferences}
            busy={false}
            error={null}
            onSave={onSave}
          />
        </ThemeProvider>,
      );
      fireEvent.submit(container.querySelector("form")!);
      expect(onSave).toHaveBeenCalledWith({
        ...DEFAULT_PREFERENCES,
        theme: "light",
        palette: "https://solid-memo.com/ns/vocab/v1.ttl#standardPalette",
      });
    });

    it("offers no Reset colors in the Standard colors", () => {
      renderScreen();
      expect(screen.queryByRole("button", { name: "Reset colors" })).toBeNull();
    });

    it("switches the text size right away, each with a sample line at its size, without saving", () => {
      const { container, chooseTextSize, onSave } = renderAppearance();
      const group = screen.getByRole("group", { name: "Text size" });
      expect(group).toHaveAccessibleDescription(
        /^Takes effect right away, and enlarges your browser's own text size\. Once these preferences are saved it is kept in your Pod/,
      );
      expect(screen.getByRole("radio", { name: "Larger" })).toBeChecked();
      expect(
        [...container.querySelectorAll<HTMLElement>(".text-size-sample")].map(
          (sample) => sample.style.fontSize,
        ),
      ).toEqual(TEXT_SIZES.map((size) => `calc(1rem * ${TEXT_SCALES[size]} / var(--text-scale))`));
      fireEvent.click(screen.getByRole("radio", { name: "Largest" }));
      expect(chooseTextSize).toHaveBeenCalledWith("largest");
      expect(onSave).not.toHaveBeenCalled();
    });
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
        scheduler: "sm2",
        desiredRetention: 0.9,
        schedulerInvitationDismissed: false,
        palette: DEFAULT_PREFERENCES.palette,
        textSize: "default",
      },
    });
    expect(screen.getByLabelText("New cards per day")).toHaveValue(10);
    expect(screen.getByLabelText("Max reviews per day")).toHaveValue(50);
    expect(screen.getByLabelText("Day starts at (hour)")).toHaveValue(2);
    expect(screen.getByLabelText("Developer mode")).toBeChecked();
    expect(screen.getByLabelText(/Again · Hard · Good · Easy/)).toBeChecked();
    expect(screen.getByLabelText(/Block the instance/)).toBeChecked();
  });

  it("offers the schedulers, SM-2 by default, with the retention and the answer buttons each one uses", () => {
    renderScreen();
    const group = screen.getByRole("group", { name: "Scheduler" });
    expect(group).toHaveAccessibleDescription(/^The method that decides when each card comes back/);
    expect(screen.getByLabelText(/^SM-2/)).toBeChecked();
    expect(group).toHaveTextContent(/The Free Spaced Repetition Scheduler, version 6/);
    // The retention is FSRS-6's alone; the answer buttons SM-2's.
    expect(screen.getByLabelText("Desired retention (%)")).toBeDisabled();
    expect(screen.getByLabelText("Desired retention (%)")).toHaveValue(90);
    expect(screen.getByLabelText(/0 to 5 scale/)).toBeEnabled();
    expect(screen.getByRole("group", { name: "Answer buttons" })).not.toHaveAccessibleDescription();
  });

  it("lists FSRS-6 first, marked as recommended, its hint saying why", () => {
    renderScreen();
    const radios = screen.getAllByRole("radio", { name: /^(FSRS-6|SM-2)/ });
    expect(radios.map((radio) => radio.getAttribute("value"))).toEqual(["fsrs6", "sm2"]);
    const fsrs = screen.getByLabelText(/^FSRS-6/);
    expect(fsrs).toHaveAccessibleName(/^FSRS-6 Recommended /);
    expect(fsrs.closest("label")).toHaveTextContent(
      "Recommended: each answer sets a clearly different interval, and a late review counts for how late it is.",
    );
    expect(screen.getByLabelText(/^SM-2/).closest("label")).not.toHaveTextContent("Recommended");
  });

  it("chooses FSRS-6 with a retention in percent, the answer buttons kept but disabled, saying why", () => {
    const { props, container } = renderScreen({
      preferences: { ...DEFAULT_PREFERENCES, answerScale: "sm2" },
    });
    fireEvent.click(screen.getByLabelText(/^FSRS-6/));
    const retention = screen.getByLabelText("Desired retention (%)");
    expect(retention).toBeEnabled();
    expect(retention).toHaveAccessibleDescription(/^With FSRS-6: the chance of recalling a card/);
    expect(retention).toHaveAttribute("min", "70");
    expect(retention).toHaveAttribute("max", "97");
    fireEvent.input(retention, { target: { value: "85" } });
    const answers = screen.getByRole("group", { name: "Answer buttons" });
    expect(answers).toBeDisabled();
    expect(answers).toHaveAccessibleDescription(/^FSRS-6 always uses the four buttons/);
    expect(screen.getByLabelText(/0 to 5 scale/)).toBeChecked();

    fireEvent.submit(container.querySelector("form")!);
    expect(props.onSave).toHaveBeenCalledWith({
      ...DEFAULT_PREFERENCES,
      scheduler: "fsrs6",
      desiredRetention: 0.85,
    });
  });

  it("keeps the stored retention when SM-2 is chosen again after the field was changed", () => {
    const { props, container } = renderScreen();
    fireEvent.click(screen.getByLabelText(/^FSRS-6/));
    fireEvent.input(screen.getByLabelText("Desired retention (%)"), { target: { value: "50" } });
    fireEvent.click(screen.getByLabelText(/^SM-2/));
    fireEvent.submit(container.querySelector("form")!);
    expect(props.onSave).toHaveBeenCalledWith(DEFAULT_PREFERENCES);
  });

  it("prefills FSRS-6 and its retention, and keeps them as they are", () => {
    const preferences = {
      ...DEFAULT_PREFERENCES,
      scheduler: "fsrs6" as const,
      desiredRetention: 0.97,
    };
    const { props, container } = renderScreen({ preferences });
    expect(screen.getByLabelText(/^FSRS-6/)).toBeChecked();
    expect(screen.getByLabelText("Desired retention (%)")).toHaveValue(97);
    fireEvent.submit(container.querySelector("form")!);
    expect(props.onSave).toHaveBeenCalledWith(preferences);
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
      scheduler: "sm2",
      desiredRetention: 0.9,
    });
  });

  it("switches the answer scale and saves it", () => {
    const { props, container } = renderScreen();
    expect(screen.getByLabelText(/0 to 5 scale/)).toBeChecked();
    // SM-2 is spelled out where it is offered.
    expect(
      screen.getByText(/^The full grades of SuperMemo-2 \(SM-2\): from 0/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Again · Hard · Good · Easy/));
    fireEvent.submit(container.querySelector("form")!);

    expect(props.onSave).toHaveBeenCalledWith({
      ...DEFAULT_PREFERENCES,
      answerScale: "minimal",
    });
  });

  it("offers what to do with invalid data, labeled from the vocabulary, and saves the choice", () => {
    const { props, container } = renderScreen();
    const group = screen.getByRole("group", { name: "When data does not conform" });
    expect(group).toContainElement(screen.getByLabelText(/Block the instance/));
    // Setting invalid data aside is the default, and says so.
    expect(screen.getByLabelText(/Set invalid data aside/)).toBeChecked();
    expect(group).toHaveTextContent(
      "Decks with invalid data are set aside until they are repaired; everything else keeps working. The default.",
    );
    expect(group).toHaveTextContent(
      "Any invalid data stops the app from using the instance until it is repaired.",
    );

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
      scheduler: "sm2",
      desiredRetention: 0.9,
      schedulerInvitationDismissed: false,
      palette: "https://solid-memo.com/ns/vocab/v1.ttl#standardPalette",
      textSize: "default",
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
        <PreferencesScreen
          instanceUrl={INSTANCE}
          preferences={DEFAULT_PREFERENCES}
          busy={false}
          error={null}
          onSave={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { name: "Studieinställningar" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nya kort per dag")).toBeInTheDocument();
    expect(screen.getByLabelText(/Lägg ogiltig data åt sidan/)).toBeChecked();
  });
});
