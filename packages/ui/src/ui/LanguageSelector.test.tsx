// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { I18nProvider } from "./i18n";
import { LanguageSelector } from "./LanguageSelector";

describe("LanguageSelector", () => {
  it("names each language in itself and chooses the one spoken", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <LanguageSelector />
      </I18nProvider>,
    );
    const list = screen.getByRole("combobox", { name: "Språk" });
    expect(list).toHaveValue("sv");
    expect(
      screen
        .getAllByRole("option")
        .map((option) => [option.textContent, option.getAttribute("lang")]),
    ).toEqual([
      ["Deutsch", "de"],
      ["English", "en"],
      ["Español", "es"],
      ["Français", "fr"],
      ["Svenska", "sv"],
      ["한국어", "ko"],
    ]);
    expect(screen.getByRole("option", { name: "Svenska" })).toHaveProperty("selected", true);
  });

  it("chooses a language", () => {
    const onChoose = vi.fn();
    render(
      <I18nProvider locale="en" onChoose={onChoose}>
        <LanguageSelector />
      </I18nProvider>,
    );
    const list = screen.getByRole("combobox", { name: "Language" });
    fireEvent.input(list, { target: { value: "sv" } });
    expect(onChoose).toHaveBeenCalledWith("sv");
    fireEvent.input(list, { target: { value: "ko" } });
    expect(onChoose).toHaveBeenCalledWith("ko");
  });

  it("says so when a language's messages could not be fetched, until it is chosen again", async () => {
    const onChoose = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(
      <I18nProvider locale="en" onChoose={onChoose}>
        <LanguageSelector />
      </I18nProvider>,
    );
    const list = screen.getByRole("combobox", { name: "Language" });
    fireEvent.input(list, { target: { value: "sv" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Svenska could not be loaded. Check your connection and try again.",
    );
    expect(screen.getByText("Svenska", { selector: "[role=alert] span" })).toHaveAttribute(
      "lang",
      "sv",
    );
    // The list goes back to the language spoken.
    expect(list).toHaveValue("en");
    fireEvent.input(list, { target: { value: "sv" } });
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });
});
