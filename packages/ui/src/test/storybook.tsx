// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import { useLayoutEffect, useState } from "preact/hooks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Decorator, Preview } from "@storybook/preact-vite";
import { LOCALES, type Locale } from "@solid-memo/domain/locale";
import { PALETTES, type Palette } from "@solid-memo/domain/palette";
import { TEXT_SIZES, type TextSize } from "@solid-memo/domain/textSize";
import { THEMES, type Theme } from "@solid-memo/domain/theme";
import { I18nProvider, loadLocale } from "../ui/i18n";
import { applyPalette, applyTextSize, applyTheme, ThemeProvider } from "../ui/theme";
import { boundedQueryKeyHash } from "../ui/queryKeys";
import { RepoUrl } from "../ui/ReportMistake";
import { AppVersion } from "../ui/WhatsNew";

/** Which way the story's text runs: the app's languages left to right, Arabic card text right to left. */
const DIRECTIONS = ["ltr", "rtl"] as const;

/** What the toolbar sets for every story (docs/storybook.md#the-toolbar). */
export interface FrameGlobals {
  locale: Locale;
  palette: Palette;
  theme: Theme;
  textSize: TextSize;
  direction: (typeof DIRECTIONS)[number];
}

/** What a story starts in: the app's defaults, English, light, left to right. */
export const INITIAL_GLOBALS: FrameGlobals = {
  locale: "en",
  palette: "standard",
  theme: "light",
  textSize: "default",
  direction: "ltr",
};

/** The repository the footer and Report a mistake link to, as the site's build names it. */
const REPO_URL = "https://github.com/solid-memo/website";

/** The query clients of the stories drawn, which the stories' test waits on before it takes a story down. */
export const storyQueryClients = new Set<QueryClient>();

/** Nothing to keep: a story's theme and palette are the toolbar's, not the component's. */
const keepNothing = () => undefined;

/**
 * What every story is shown in, as the app shows its screens (AppShell,
 * apps/web/src/main.tsx): a query client of its own that tries nothing
 * twice, the language, the theme, the palette and the text size the
 * toolbar chose, set on the page's root as the app sets them, and the
 * direction on the story's own box.
 */
export function StoryFrame({
  globals,
  children,
}: {
  globals: FrameGlobals;
  children: ComponentChildren;
}) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, queryKeyHashFn: boundedQueryKeyHash() } },
    });
    storyQueryClients.add(client);
    return client;
  });
  const { locale, palette, theme, textSize, direction } = globals;
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    applyPalette(palette);
    applyTextSize(textSize);
    applyTheme(theme);
  }, [locale, palette, theme, textSize]);
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider locale={locale}>
        <ThemeProvider choice={theme} preferred={theme} onChoose={keepNothing}>
          <RepoUrl.Provider value={REPO_URL}>
            <AppVersion.Provider value="0.0.0">
              <div class="story-frame" dir={direction}>
                {children}
              </div>
            </AppVersion.Provider>
          </RepoUrl.Provider>
        </ThemeProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

/** Each story in its frame, with the toolbar's globals. */
const inFrame: Decorator = (Story, context) => (
  <StoryFrame globals={{ ...INITIAL_GLOBALS, ...context.globals }}>
    <Story />
  </StoryFrame>
);

/** A menu of the toolbar, as the preview's globalTypes take it. */
type ToolbarMenu = NonNullable<Preview["globalTypes"]>[string];

/** A toolbar menu: its title, its icon and its choices, each its own title. */
function menu(
  title: string,
  icon: NonNullable<ToolbarMenu["toolbar"]>["icon"],
  values: readonly string[],
): ToolbarMenu {
  return {
    description: title,
    toolbar: { title, icon, items: [...values], dynamicTitle: true },
  };
}

/**
 * The Storybook's preview (.storybook/preview.ts): every story in its
 * frame, the toolbar's menus, and the language the toolbar chose
 * fetched before the story is drawn, as the app fetches its own before
 * the first render.
 */
const preview: Preview = {
  decorators: [inFrame],
  globalTypes: {
    locale: menu("Language", "globe", LOCALES),
    palette: menu("Palette", "paintbrush", PALETTES),
    theme: menu("Theme", "contrast", THEMES),
    textSize: menu("Text size", "zoom", TEXT_SIZES),
    direction: menu("Direction", "transfer", DIRECTIONS),
  },
  initialGlobals: { ...INITIAL_GLOBALS },
  loaders: [
    async ({ globals }) => {
      await loadLocale((globals.locale as Locale | undefined) ?? INITIAL_GLOBALS.locale);
      return {};
    },
  ],
  parameters: {
    layout: "padded",
    controls: { expanded: true },
  },
};

export default preview;
