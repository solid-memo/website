// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import type { CustomPalette } from "@solid-memo/domain/customPalette";
import { PaletteEditorScreen } from "./PaletteEditorScreen";
import { I18nProvider } from "./i18n";
import { ThemeProvider } from "./theme";

const READING: CustomPalette = {
  url: "https://pod.example/solid-memo/main/palettes.ttl#palette-reading",
  title: { en: "Reading", sv: "Läsning" },
  basedOn: "parchment",
  light: { "--bg": "#f4ecd8" },
  dark: {},
};

function renderEditor(
  props: Partial<Parameters<typeof PaletteEditorScreen>[0]> = {},
  { palette = "standard" as const, choosePalette = vi.fn() } = {},
) {
  const onSave = vi.fn();
  const view = render(
    <ThemeProvider
      choice="light"
      onChoose={() => undefined}
      palette={palette}
      onChoosePalette={choosePalette}
    >
      <PaletteEditorScreen
        busy={false}
        error={null}
        cancelHref="#/preferences"
        onSave={onSave}
        {...props}
      />
    </ThemeProvider>,
  );
  return { ...view, onSave, choosePalette };
}

/** The color field of a role in a theme's group. */
function colorField(theme: "Light theme" | "Dark theme", role: string) {
  return within(screen.getByRole("group", { name: theme })).getByLabelText(role);
}

describe("PaletteEditorScreen", () => {
  it("starts a new palette at Standard's colors, each field named for its role", () => {
    renderEditor();
    expect(screen.getByRole("heading", { name: "Design a palette" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Standard" })).toBeChecked();
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(colorField("Light theme", "Page background")).toHaveValue("#f7f6f1");
    expect(colorField("Dark theme", "Page background")).toHaveValue("#11171e");
    expect(colorField("Light theme", "Answer button 0 — Blackout")).toHaveValue("#d63a25");
    expect(screen.getByRole("status")).toHaveTextContent("Every pair has the contrast it needs.");
  });

  it("edits a palette: its name in the page's language, its base and its colors", () => {
    renderEditor({ palette: READING });
    expect(screen.getByRole("heading", { name: "Edit a palette" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Reading");
    expect(screen.getByRole("radio", { name: "Parchment (low glare)" })).toBeChecked();
    expect(colorField("Light theme", "Page background")).toHaveValue("#f4ecd8");
    // A color it does not set is its base's.
    expect(colorField("Light theme", "Text")).toHaveValue("#2c3d43");
  });

  it("measures each pair as the colors change, in a table for each theme", () => {
    renderEditor();
    const light = screen.getByRole("region", { name: "Contrast in the light theme" });
    expect(within(light).getAllByRole("row").length).toBeGreaterThan(30);
    expect(within(light).queryAllByText("Too little")).toHaveLength(0);
    fireEvent.input(colorField("Light theme", "Muted text"), { target: { value: "#a0a0a0" } });
    expect(within(light).getAllByText("Too little").length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent(
      /^\d+ pairs have less contrast than they need\.$/,
    );
    // A tint of an answer button is named as such.
    expect(within(light).getAllByText("the tint of Answer button 5 — Easy").length).toBeGreaterThan(
      0,
    );
    expect(within(light).getAllByText("4.5:1").length).toBeGreaterThan(0);
  });

  it("saves a palette whose pairs all have the contrast they need", () => {
    const { onSave, container } = renderEditor({ palette: READING });
    fireEvent.input(screen.getByLabelText("Name"), { target: { value: " Läsning ljus " } });
    fireEvent.click(screen.getByRole("radio", { name: "Standard" }));
    fireEvent.submit(container.querySelector("form")!);
    expect(onSave).toHaveBeenCalledWith(
      {
        url: READING.url,
        title: { en: "Läsning ljus", sv: "Läsning" },
        basedOn: "standard",
        light: { "--bg": "#f4ecd8" },
        dark: {},
      },
      false,
    );
  });

  it("asks before it saves a pair with less contrast than it needs: only Use anyway saves it", () => {
    const { onSave, container } = renderEditor();
    fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Faint" } });
    fireEvent.input(colorField("Dark theme", "Muted text"), { target: { value: "#404040" } });
    fireEvent.submit(container.querySelector("form")!);
    expect(onSave).not.toHaveBeenCalled();
    const warning = screen.getByRole("alert");
    expect(warning).toHaveTextContent("Some colors have less contrast than they need.");
    fireEvent.click(within(warning).getByRole("button", { name: "Use anyway" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ url: null, dark: { "--text-muted": "#404040" } }),
      true,
    );
    // A change of color asks again.
    fireEvent.input(colorField("Dark theme", "Muted text"), { target: { value: "#414141" } });
    expect(screen.queryByRole("button", { name: "Use anyway" })).not.toBeInTheDocument();
  });

  it("refuses a palette whose text cannot be read on the background", () => {
    const { onSave, container } = renderEditor();
    fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Unreadable" } });
    fireEvent.input(colorField("Light theme", "Text"), { target: { value: "#f0f0f0" } });
    expect(screen.getByRole("status")).toHaveTextContent("The text is too faint to read");
    fireEvent.submit(container.querySelector("form")!);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("less than 3:1");
    expect(screen.queryByRole("button", { name: "Use anyway" })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Contrast in the light theme" })).getAllByText(
        "Unreadable",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("puts a theme's colors back to the base's", () => {
    renderEditor({ palette: READING });
    fireEvent.click(screen.getByRole("button", { name: "Back to the base's light colors" }));
    expect(colorField("Light theme", "Page background")).toHaveValue("#ece3cc");
    fireEvent.click(screen.getByRole("button", { name: "Back to the base's dark colors" }));
  });

  it("shows the preview in the theme's colors, each one held to #rrggbb", () => {
    const { container } = renderEditor({
      palette: { ...READING, light: { "--bg": "#f4ecd8" } },
    });
    const [light] = container.querySelectorAll<HTMLElement>(".palette-preview");
    expect(light!.style.getPropertyValue("--bg")).toBe("#f4ecd8");
    expect(light).toHaveAttribute("aria-hidden", "true");
  });

  it("shows the save as it goes, and what failed", () => {
    renderEditor({ busy: true, error: "The pod refused" });
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByText("The pod refused")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to preferences" })).toHaveAttribute(
      "href",
      "#/preferences",
    );
  });

  it("offers Reset colors while a palette other than Standard is shown, drawn in Standard's", () => {
    const { choosePalette } = renderEditor({}, { palette: "parchment" as never });
    const reset = screen.getByRole("button", { name: "Reset colors" });
    expect(reset.closest("[data-palette]")).toHaveAttribute("data-palette", "standard");
    fireEvent.click(reset);
    expect(choosePalette).toHaveBeenCalledWith("standard");
  });

  it("names its fields in the page's language", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <PaletteEditorScreen
          palette={READING}
          busy={false}
          error={null}
          cancelHref="#/preferences"
          onSave={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.getByLabelText("Namn")).toHaveValue("Läsning");
    expect(colorField("Ljust tema" as never, "Sidans bakgrund")).toHaveValue("#f4ecd8");
  });
});
