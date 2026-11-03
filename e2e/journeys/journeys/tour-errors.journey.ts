// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { test } from "../fixtures.ts";
import { logInAndCreateInstance } from "../flows/logIn.ts";
import {
  catalogOf,
  metaOf,
  nameAccessControl,
  writeDraftWithUnsupportedChapter,
} from "../flows/podDocuments.ts";
import { BRIGHTEST_STARS } from "../pages/Library.ts";

/**
 * The errors tour (docs/accessibility.md, Checked automatically): what
 * the app shows when something goes wrong, each screen checked in every
 * palette and theme but Standard light, which the journeys that reach
 * it check it in. A screen that fails while it renders, as in
 * render-error.journey.ts; a release the pod will not make public, and
 * a draft the Studio will not open, as in pod-safety.journey.ts. The
 * learner picks High contrast in the light theme first, as they would
 * in Preferences, and the screens are shown in it.
 *
 * What it catches: an error message, or the screen around it, whose
 * colors fail in a palette or theme no journey shows it in.
 */
test("the errors screens in every palette and theme @tour-errors", async ({
  app,
  account,
  runId,
  otherApp,
}) => {
  const name = `Drafts ${runId}`;
  const title = `Notes ${runId}`;
  const release = BRIGHTEST_STARS.en;
  const instance = `${account.pod}planted-${runId}/memo/`;
  const draft = `${instance}drafts/notes/v1/release.ttl`;
  const elsewhere = `${account.pod}notes-${runId}`;
  await otherApp.put(`${instance}meta.ttl`, metaOf(name), "text/turtle");
  await otherApp.put(
    `${instance}catalog.ttl`,
    catalogOf(name, account.webId, [], [draft]),
    "text/turtle",
  );
  const id = await writeDraftWithUnsupportedChapter(otherApp, draft, title, elsewhere);

  await app.tour("errors", async () => {
    await app.step(
      "01 · Log in, create an instance, and choose High contrast in the light theme",
      async () => {
        await app.onboarding.visit();
        await logInAndCreateInstance(app, account, `Home ${runId}`);
        await app.preferences.open();
        await app.preferences.setPalette("high-contrast");
        await app.preferences.setTheme("light");
        await app.preferences.save();
      },
      { screen: "decks.empty" },
    );

    await app.step(
      "02 · Open the Studio, whose code fails",
      async () => {
        await app.crash.breakStudio(`Cannot read ${draft}`);
        await app.chrome.instanceNav.getByRole("link", { name: app.t("studio.open") }).click();
        await app.crash.expectShown(app.t("studio.name"));
      },
      { screen: "crash" },
    );

    await app.step(
      "03 · In the mended Studio, publish the next version of a library release and make it public: the pod does not",
      async () => {
        await app.crash.goToStart();
        await app.crash.mendStudio();
        await app.studio.openFromApp();
        await app.studio.openDrafts(`Home ${runId}`);
        await app.studio.draftNextVersion(
          "https://solid-memo.com/decks/brightest-stars/v1.ttl",
          release,
          2,
        );
        await app.draftEditor.openDraft(release, { course: false });
        await nameAccessControl(app.page, `${elsewhere}.acl`);
        await app.draftEditor.openRelease();
        await app.draftEditor.makePublicRefused(await app.draftEditor.publishNotPublic());
      },
      { screen: "studio.draft.release-refused" },
    );

    await app.step(
      "04 · Attach an instance whose draft has a chapter id Solid Memo does not accept, and open the draft: it is not opened",
      async () => {
        await app.studio.backToApp();
        await app.chrome.switchInstance();
        await app.instancePicker.attach(instance, name);
        await app.studio.openFromApp();
        await app.studio.openDrafts(name);
        await app.draftEditor.openRefused(title, app.t("errors.draftIdUnsupported", { id }));
      },
      { screen: "studio.draft.refused" },
    );
  });
});
