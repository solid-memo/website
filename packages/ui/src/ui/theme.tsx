// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createContext, type ComponentChildren } from "preact";
import { useContext, useEffect, useLayoutEffect } from "preact/hooks";
import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import {
  isHexColor,
  paintedColors,
  PAINTED_ROLES,
  type CustomPalette,
  type ShownPalette,
} from "@solid-memo/domain/customPalette";
import { DEFAULT_PALETTE, type Palette } from "@solid-memo/domain/palette";
import { DEFAULT_TEXT_SIZE, type TextSize } from "@solid-memo/domain/textSize";
import { resolveTheme, type Theme, type ThemeChoice } from "@solid-memo/domain/theme";
import { queryKeys } from "./queryKeys";

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
 * Colors as style properties a palette of the user's own may set: only
 * the roles it may paint (PAINTED_ROLES), each only when its value is
 * `#rrggbb`. What the pod, or the device's copy of it, says is held to
 * this once more where it is painted, so no CSS text, `url()` or `var()`
 * from either ever reaches a style (docs/theme.md, Palettes of one's
 * own).
 */
export function paletteStyle(colors: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    PAINTED_ROLES.filter((role) => Object.hasOwn(colors, role) && isHexColor(colors[role])).map(
      (role) => [role, colors[role]!],
    ),
  );
}

/**
 * Paints the root in a palette of the user's own, in the theme shown,
 * over its base (applyPalette): each of its colors set on the root's
 * style, one property at a time (paletteStyle). With none, every color
 * a palette may paint is taken off the root again. Before applyTheme,
 * whose meta tags take the background it gives.
 */
export function applyCustomColors(custom: CustomPalette | null, theme: Theme) {
  const style = document.documentElement.style;
  for (const role of PAINTED_ROLES) style.removeProperty(role);
  if (custom === null) return;
  for (const [role, color] of Object.entries(paletteStyle(paintedColors(custom, theme))))
    style.setProperty(role, color);
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
  /** The palette chosen: a built-in one, or the base of the user's own shown over it. */
  palette: Palette;
  /** The palette of the user's own shown, over its base; null for none. */
  customPalette: CustomPalette | null;
  /** Show the page in another palette from now on. */
  choosePalette(palette: Palette): void;
  /** Show the page in a palette of the user's own from now on. */
  chooseCustomPalette(palette: CustomPalette): void;
  /** Show the palette an instance's preferences are shown in. */
  adoptPalette(shown: ShownPalette): void;
  /** The text size chosen. */
  textSize: TextSize;
  /** Show the text at another size from now on. */
  chooseTextSize(size: TextSize): void;
  /** Show the text at the size an instance's preferences hold. */
  adoptTextSize(size: TextSize): void;
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
  customPalette: null,
  choosePalette: ignore,
  chooseCustomPalette: ignore,
  adoptPalette: ignore,
  textSize: DEFAULT_TEXT_SIZE,
  chooseTextSize: ignore,
  adoptTextSize: ignore,
});

/** The theme the screens below are shown in, and how to choose another. */
export function ThemeProvider({
  choice,
  preferred = "light",
  onChoose,
  onFollowInstance = ignore,
  onAdopt = ignore,
  palette = DEFAULT_PALETTE,
  customPalette = null,
  onChoosePalette = ignore,
  onChooseCustomPalette = ignore,
  onAdoptPalette = ignore,
  textSize = DEFAULT_TEXT_SIZE,
  onChooseTextSize = ignore,
  onAdoptTextSize = ignore,
  children,
}: {
  choice: ThemeChoice;
  /** The theme the browser prefers. */
  preferred?: Theme;
  onChoose: (choice: ThemeChoice) => void;
  onFollowInstance?: (instanceUrl: string | null) => void;
  onAdopt?: (choice: ThemeChoice) => void;
  palette?: Palette;
  customPalette?: CustomPalette | null;
  onChoosePalette?: (palette: Palette) => void;
  onChooseCustomPalette?: (palette: CustomPalette) => void;
  onAdoptPalette?: (shown: ShownPalette) => void;
  textSize?: TextSize;
  onChooseTextSize?: (size: TextSize) => void;
  onAdoptTextSize?: (size: TextSize) => void;
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
        customPalette,
        choosePalette: onChoosePalette,
        chooseCustomPalette: onChooseCustomPalette,
        adoptPalette: onAdoptPalette,
        textSize,
        chooseTextSize: onChooseTextSize,
        adoptTextSize: onAdoptTextSize,
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
 * Ties the theme, the palette and the text size to the open instance:
 * shows the choices its preferences hold, and has a new choice kept
 * there (once it has preferences).
 */
export function useInstanceTheme(useCases: UseCases, instanceUrl: string | null) {
  const { followInstance, adoptTheme, adoptPalette, adoptTextSize } = useTheme();
  // A layout effect, so the instance is let go of as the screen goes (Preact 11 runs a plain effect's cleanup a frame late).
  useLayoutEffect(() => {
    followInstance(instanceUrl);
    return () => followInstance(null);
  }, [instanceUrl]);
  const url = instanceUrl ?? "";
  const enabled = instanceUrl !== null;
  const theme = useQuery({
    queryKey: queryKeys.instanceAppearancePart(url, "theme"),
    queryFn: () => useCases.instanceTheme(instanceUrl!),
    enabled,
  });
  const palette = useQuery({
    queryKey: queryKeys.instanceAppearancePart(url, "palette"),
    queryFn: () => useCases.instancePalette(instanceUrl!),
    enabled,
  });
  const textSize = useQuery({
    queryKey: queryKeys.instanceAppearancePart(url, "textSize"),
    queryFn: () => useCases.instanceTextSize(instanceUrl!),
    enabled,
  });
  // Every read counts, an unchanged one too: after a failed write it puts back what the pod holds.
  useEffect(() => {
    if (theme.data !== undefined && theme.data !== null) adoptTheme(theme.data);
  }, [theme.data, theme.dataUpdatedAt]);
  useEffect(() => {
    if (palette.data !== undefined && palette.data !== null) adoptPalette(palette.data);
  }, [palette.data, palette.dataUpdatedAt]);
  useEffect(() => {
    if (textSize.data !== undefined && textSize.data !== null) adoptTextSize(textSize.data);
  }, [textSize.data, textSize.dataUpdatedAt]);
}
