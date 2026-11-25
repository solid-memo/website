// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it } from "vitest";
import { render } from "preact";
import { cleanup } from "@testing-library/preact";
import { setProjectAnnotations } from "@storybook/preact-vite";
import { composeStories } from "storybook/preview-api";
import preview, { storyQueryClients } from "./test/storybook";

/** What a stories file holds: its meta, and its stories by name. */
type StoriesFile = Parameters<typeof composeStories>[0];

/** A story composed with the preview: `run` draws it in its frame and plays it. */
type ComposedStory = { run: () => Promise<void> };

/** Every stories file of the package, by its path from here. */
const files = import.meta.glob<StoriesFile>("./**/*.stories.tsx", { eager: true });

/** The UI's files, by their path from here: each a component's, but those NOT_COMPONENTS names. */
const sources = Object.keys(
  import.meta.glob(["./ui/**/*.tsx", "!./ui/**/*.test.tsx", "!./ui/**/*.stories.tsx"]),
);

/** The UI's files that have no stories, each with its reason: none draws a component of its own. */
const NOT_COMPONENTS: Record<string, string> = {
  "./ui/i18n.tsx": "The language's provider and its messages: every story is drawn in it.",
  "./ui/theme.tsx": "The theme's provider and what paints the page: every story is drawn in it.",
  "./ui/linkify.tsx":
    "A function that turns a text's addresses into links, drawn by the components that call it.",
  "./ui/StatisticsCharts.tsx":
    "The charts the statistics screen draws, each with stories in charts/.",
};

/**
 * The preview, over the Preact renderer's own (its `render`): Storybook's
 * composeStories doesn't read what setProjectAnnotations keeps unless a
 * renderer's own wraps it, which Preact's doesn't, so it is given them.
 */
const project = setProjectAnnotations(preview);

/**
 * Each story is taken down after it runs, once it has settled: Storybook's run draws it into
 * a box of its own on the body, and the Preact renderer never unmounts
 * it, so its effects and listeners (hashchange, matchMedia) would go on
 * into the stories after it.
 */
/** What a story shows and asks for now: its queries' states, its mutations and the page. */
function snapshot(): string {
  const queries = [...storyQueryClients].flatMap((client) => [
    client.isMutating(),
    ...client
      .getQueryCache()
      .getAll()
      .map(({ queryHash, state }) => [
        queryHash,
        state.status,
        state.fetchStatus,
        state.dataUpdatedAt,
      ]),
  ]);
  return JSON.stringify(queries) + document.body.innerHTML;
}

/** How long a story must stay unchanged to count as settled, and how long it may take, in ms. */
const STILL = 100;
const AT_MOST = 3_000;

/**
 * Waits until a story has settled: what it asked for answered and drawn,
 * nothing changed for STILL ms. A story that is loading on purpose (a fake
 * that never answers) settles too, as it stops changing.
 */
async function settle() {
  const start = Date.now();
  let last = snapshot();
  let since = start;
  while (Date.now() - start < AT_MOST) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    const now = snapshot();
    if (now !== last) [last, since] = [now, Date.now()];
    else if (Date.now() - since >= STILL) return;
  }
}

afterEach(async () => {
  await settle();
  storyQueryClients.clear();
  for (const canvas of document.body.children) render(null, canvas);
  cleanup();
  document.body.innerHTML = "";
});

/**
 * Every story is drawn in its frame, as the Storybook draws it, and its
 * `play` run: a story that throws, or whose play's expectations fail,
 * fails here (docs/storybook.md#stories-are-tests).
 */
describe.each(Object.entries(files))("%s", (_path, file) => {
  const stories = Object.entries(composeStories(file, project)) as [string, ComposedStory][];

  it("has stories", () => {
    expect(stories.length).toBeGreaterThan(0);
  });

  it.each(stories)("%s", async (_name, Story) => {
    await Story.run();
  });
});

/** A component's file without stories beside it fails (docs/storybook.md#stories-are-tests). */
describe("every component has stories", () => {
  it.each(sources)("%s", (source) => {
    const stories = source.replace(/\.tsx$/, ".stories.tsx");
    if (source in NOT_COMPONENTS) expect(files).not.toHaveProperty([stories]);
    else expect(files).toHaveProperty([stories]);
  });

  it("names only the UI's files", () => {
    for (const source of Object.keys(NOT_COMPONENTS)) expect(sources).toContain(source);
  });
});
