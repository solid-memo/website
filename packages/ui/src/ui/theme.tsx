// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createContext, type ComponentChildren } from "preact";
import { useContext, useEffect, useLayoutEffect } from "preact/hooks";
import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { DEFAULT_PALETTE, type Palette } from "@solid-memo/domain/palette";
import { DEFAULT_TEXT_SIZE, type TextSize } from "@solid-memo/domain/textSize";
import { resolveTheme, type Theme, type ThemeChoice } from "@solid-memo/domain/theme";

/** The browser's wish for a dark page. */
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/** The theme the browser prefers. */
export function browserTheme(): Theme {
  return matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/**
 * Shows the page in a theme: the stylesheet's colors follow the root's
 * data-theme (index.html sets it before the first paint), the browser's
 * chrome follows the theme-color meta tags, in the page's background
 * as the palette shown has it (--bg, palettes.css).
 */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const background = getComputedStyle(root).getPropertyValue("--bg").trim();
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = background;
  }
}

/**
 * Shows the page in a palette: the stylesheet's colors follow the root's
 * data-palette (index.html sets it before the first paint), which the
 * standard palette goes without. Before applyTheme, whose meta tags take
 * the background the palette gives.
 */
export function applyPalette(palette: Palette) {
  const root = document.documentElement;
  if (palette === DEFAULT_PALETTE) delete root.dataset.palette;
  else root.dataset.palette = palette;
}

/**
 * Shows the text at a size: the stylesheet scales the root's font size
 * by the root's data-text-size (index.html sets it before the first
 * paint), which the default size goes without.
 */
export function applyTextSize(size: TextSize) {
  const root = document.documentElement;
  if (size === DEFAULT_TEXT_SIZE) delete root.dataset.textSize;
  else root.dataset.textSize = size;
}

/** The query key of an instance's theme, to refetch it after a write. */
export function instanceThemeKey(instanceUrl: string) {
  return ["instanceTheme", instanceUrl];
}

interface ThemeState {
  /** What the user chose, "system" among the choices. */
  choice: ThemeChoice;
  /** The theme shown: the choice, or for "system" the browser's. */
  theme: Theme;
  /** Show another theme from now on. */
  chooseTheme(choice: ThemeChoice): void;
  /** The instance open now, whose preferences keep the choice; null outside one. */
  followInstance(instanceUrl: string | null): void;
  /** Show the choice an instance's preferences hold. */
  adoptTheme(choice: ThemeChoice): void;
  /** The palette chosen. */
  palette: Palette;
  /** Show the page in another palette from now on. */
  choosePalette(palette: Palette): void;
  /** The text size chosen. */
  textSize: TextSize;
  /** Show the text at another size from now on. */
  chooseTextSize(size: TextSize): void;
}

/** What a theme state does with what it is not asked to keep. */
const ignore = () => undefined;

const ThemeContext = createContext<ThemeState>({
  choice: "system",
  theme: "light",
  chooseTheme: ignore,
  followInstance: ignore,
  adoptTheme: ignore,
  palette: DEFAULT_PALETTE,
  choosePalette: ignore,
  textSize: DEFAULT_TEXT_SIZE,
  chooseTextSize: ignore,
});

/** The theme the screens below are shown in, and how to choose another. */
export function ThemeProvider({
  choice,
  preferred = "light",
  onChoose,
  onFollowInstance = ignore,
  onAdopt = ignore,
  palette = DEFAULT_PALETTE,
  onChoosePalette = ignore,
  textSize = DEFAULT_TEXT_SIZE,
  onChooseTextSize = ignore,
  children,
}: {
  choice: ThemeChoice;
  /** The theme the browser prefers. */
  preferred?: Theme;
  onChoose: (choice: ThemeChoice) => void;
  onFollowInstance?: (instanceUrl: string | null) => void;
  onAdopt?: (choice: ThemeChoice) => void;
  palette?: Palette;
  onChoosePalette?: (palette: Palette) => void;
  textSize?: TextSize;
  onChooseTextSize?: (size: TextSize) => void;
  children: ComponentChildren;
}) {
  return (
    <ThemeContext.Provider
      value={{
        choice,
        theme: resolveTheme(choice, preferred),
        chooseTheme: onChoose,
        followInstance: onFollowInstance,
        adoptTheme: onAdopt,
        palette,
        choosePalette: onChoosePalette,
        textSize,
        chooseTextSize: onChooseTextSize,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

/** The theme the page is shown in; light, as the browser prefers, outside a provider. */
export function useTheme(): ThemeState {
  return useContext(ThemeContext);
}

/**
 * Ties the theme to the open instance: shows the choice its preferences
 * hold, and has a new choice kept there (once it has preferences).
 */
export function useInstanceTheme(useCases: UseCases, instanceUrl: string | null) {
  const { followInstance, adoptTheme } = useTheme();
  // A layout effect, so the instance is let go of as the screen goes (Preact 11 runs a plain effect's cleanup a frame late).
  useLayoutEffect(() => {
    followInstance(instanceUrl);
    return () => followInstance(null);
  }, [instanceUrl]);
  const query = useQuery({
    queryKey: instanceThemeKey(instanceUrl ?? ""),
    queryFn: () => useCases.instanceTheme(instanceUrl!),
    enabled: instanceUrl !== null,
  });
  // Every read counts, an unchanged one too: after a failed write it puts back what the pod holds.
  useEffect(() => {
    if (query.data !== undefined && query.data !== null) adoptTheme(query.data);
  }, [query.data, query.dataUpdatedAt]);
}
