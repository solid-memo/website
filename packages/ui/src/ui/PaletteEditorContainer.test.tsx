// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { AppError } from "@solid-memo/domain/appError";
import type { CustomPalette } from "@solid-memo/domain/customPalette";
import type { Instance } from "@solid-memo/domain/instance";
import { makeUseCasesFake } from "../test/useCasesFake";
import { PaletteEditorContainer } from "./PaletteEditorContainer";
import { ThemeProvider } from "./theme";

const instance: Instance = { url: "https://pod.example/solid-memo/main/", name: "Main" };
const READING: CustomPalette = {
  url: `${instance.url}palettes.ttl#palette-reading`,
  title: { en: "Reading" },
  basedOn: "parchment",
  light: {},
  dark: {},
};

function renderContainer(useCases: UseCases, paletteUrl?: string) {
  const onDone = vi.fn();
  const chooseCustomPalette = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ThemeProvider
        choice="light"
        onChoose={() => undefined}
        onChooseCustomPalette={chooseCustomPalette}
      >
        <PaletteEditorContainer
          useCases={useCases}
          instance={instance}
          paletteUrl={paletteUrl}
          onDone={onDone}
        />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { onDone, chooseCustomPalette };
}

describe("PaletteEditorContainer", () => {
  it("waits for the palettes, then edits the one named", async () => {
    renderContainer(makeUseCasesFake({ listPalettes: vi.fn(async () => [READING]) }), READING.url);
    expect(screen.getByText("Loading the palettes…")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Edit a palette" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Reading");
  });

  it("starts a new palette for one the instance does not have", async () => {
    renderContainer(makeUseCasesFake(), `${instance.url}palettes.ttl#palette-gone`);
    expect(await screen.findByRole("heading", { name: "Design a palette" })).toBeInTheDocument();
  });

  it("says why the palettes cannot be read", async () => {
    renderContainer(
      makeUseCasesFake({
        listPalettes: vi.fn(async () => {
          throw new Error("palettes unreachable");
        }),
      }),
    );
    expect(await screen.findByText("palettes unreachable")).toBeInTheDocument();
  });

  it("saves the palette, shows the app in it and goes back", async () => {
    const useCases = makeUseCasesFake({ listPalettes: vi.fn(async () => [READING]) });
    const { onDone, chooseCustomPalette } = renderContainer(useCases, READING.url);
    fireEvent.click(await screen.findByRole("button", { name: "Save and use" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(useCases.savePalette).toHaveBeenCalledWith(instance.url, READING, {
      useAnyway: false,
    });
    expect(chooseCustomPalette).toHaveBeenCalledWith(READING);
  });

  it("says what kept the palette from being saved", async () => {
    renderContainer(
      makeUseCasesFake({
        savePalette: vi.fn(async () => Promise.reject(new AppError("paletteNameEmpty"))),
      }),
    );
    fireEvent.input(await screen.findByLabelText("Name"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and use" }));
    expect(await screen.findByText("A palette needs a name.")).toBeInTheDocument();
  });
});
