// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator } from "@playwright/test";
import { escapeRegExp, type Locale } from "../harness/strings.ts";
import { Screen } from "./Screen.ts";

/** The themes the app shows (docs/theme.md). */
export type Theme = "light" | "dark";

/**
 * What is around every screen: the masthead (who is logged in, log out,
 * the language, the theme), the breadcrumbs, the instance's own links
 * (statistics, preferences) and, in developer mode, the developer tools;
 * in the Studio, its sidebar and the tabs of the deck or draft it shows.
 */
export class Chrome extends Screen {
  get breadcrumbs(): Locator {
    return this.page.getByRole("navigation", { name: this.t("breadcrumbs.label") });
  }

  get instanceNav(): Locator {
    return this.page.getByRole("navigation", { name: this.t("instanceBar.label") });
  }

  get developerTools(): Locator {
    return this.page.getByRole("navigation", { name: this.t("workspace.developerTools") });
  }

  /** Solid Memo Studio's sidebar: the open instance's sections, its decks and its drafts. */
  get studioSidebar(): Locator {
    return this.page.getByRole("navigation", { name: this.t("studio.shell.nav"), exact: true });
  }

  /** The tabs of the deck or the draft the Studio shows. */
  studioTabs(of: "deck" | "draft"): Locator {
    return this.page.getByRole("navigation", { name: this.t(`studio.tabs.${of}`), exact: true });
  }

  /** Follows a section of the Studio's sidebar, by its key ("groups"). */
  async studioSection(section: string): Promise<void> {
    await this.studioSidebar
      .getByRole("link", { name: this.t(`studio.shell.section.${section}`), exact: true })
      .click();
  }

  /**
   * Follows a tab of the deck or the draft the Studio shows, by its key
   * ("schedule"), which is then the current one. A draft's Check counts
   * its problems after its name ("Check 2 problems").
   */
  async studioTab(of: "deck" | "draft", tab: string): Promise<void> {
    const link = this.studioTabs(of).getByRole("link", {
      name: new RegExp(`^${escapeRegExp(this.t(`studio.tabs.${tab}`))}( |$)`),
    });
    await link.click();
    await expect(link).toHaveAttribute("aria-current", "page");
  }

  /**
   * Quick opens an entry of the Studio's palette: Ctrl+K, the query
   * typed, the entry named picked first, then Enter. The palette closes.
   */
  async quickOpen(query: string, entry: string): Promise<void> {
    await this.intent(`Quick open ${entry}`, async () => {
      await this.page.keyboard.press("Control+k");
      const palette = this.page.getByRole("dialog", { name: this.t("studio.palette.heading") });
      const field = palette.getByRole("combobox", { name: this.t("studio.palette.label") });
      await expect(field).toBeFocused();
      await field.fill(query);
      await expect(palette.getByRole("option", { name: entry, exact: true })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await field.press("Enter");
      await expect(palette).toBeHidden();
    });
  }

  /** The language list above the masthead, not the choice in Preferences. */
  get languageSelector(): Locator {
    return this.page.getByRole("banner").getByRole("combobox", { name: this.t("language.label") });
  }

  async expectLoggedInAs(webId: string): Promise<void> {
    await this.intent("Check who is logged in", async () => {
      await expect(this.page.getByRole("banner")).toContainText(
        this.t("app.loggedInAs", { name: "" }).trim(),
      );
      await expect(this.page.getByRole("banner").getByRole("link", { name: webId })).toBeVisible();
    });
  }

  /**
   * The sun/moon button at the top, named for the theme it switches to
   * (theme.toDark, theme.toLight): its name tells the theme shown.
   */
  private themeToggle(to: Theme): Locator {
    return this.page.getByRole("button", {
      name: this.t(to === "dark" ? "theme.toDark" : "theme.toLight"),
      exact: true,
    });
  }

  /** Switches the theme with the sun/moon button at the top. */
  async switchTheme(to: Theme): Promise<void> {
    await this.intent(`Switch to the ${to} theme`, async () => {
      await this.themeToggle(to).click();
      await this.expectTheme(to);
    });
  }

  /**
   * Expects the theme shown: the button offers the other one, and the
   * page's colors are the theme's (data-theme on the document, which the
   * stylesheet's dark colors hang off, docs/theme.md).
   */
  async expectTheme(theme: Theme): Promise<void> {
    await this.intent(`Check that the theme is ${theme}`, async () => {
      await expect(this.themeToggle(theme === "dark" ? "light" : "dark")).toBeVisible();
      await expect(this.page.locator("html")).toHaveAttribute("data-theme", theme);
    });
  }

  /** The masthead says a guest is studying, and offers to log in to keep it. */
  async expectGuest(): Promise<void> {
    await expect(this.page.getByRole("banner")).toContainText(this.t("app.guestLine"));
    await expect(this.keepStudyButton).toBeVisible();
  }

  private get keepStudyButton(): Locator {
    return this.page
      .getByRole("banner")
      .getByRole("button", { name: this.t("app.keepStudy"), exact: true });
  }

  /** A guest's "Keep my study: log in": the WebID form, the study left where it is meanwhile. */
  async keepStudy(): Promise<void> {
    await this.intent("Log in to keep the study", async () => {
      await this.keepStudyButton.click();
      await expect(this.page.getByText(this.t("app.loginToKeep"), { exact: true })).toBeVisible();
      await expect(this.page.getByRole("textbox", { name: "WebID" })).toBeVisible();
    });
  }

  /** Follows the breadcrumb named, and waits until the app is there (it is the current one). */
  async breadcrumb(key: string): Promise<void> {
    await this.intent(`Follow the breadcrumb ${this.t(key)}`, async () => {
      await this.breadcrumbs.getByRole("link", { name: this.t(key), exact: true }).click();
      await this.expectBreadcrumbHere(key);
    });
  }

  /**
   * Reloads the app, everything it showed read again from the pod: the
   * session is restored and the app opens at the screen it showed, its
   * URL and its trail's last step as before.
   */
  async reload(): Promise<void> {
    await this.intent("Reload the app", async () => {
      const here = this.breadcrumbs.locator('[aria-current="page"]');
      const url = this.page.url();
      const step = await here.innerText();
      await this.page.reload();
      await expect(this.page).toHaveURL(url);
      await expect(here).toHaveText(step);
    });
  }

  async expectBreadcrumbHere(key: string): Promise<void> {
    await expect(this.breadcrumbs.locator('[aria-current="page"]')).toHaveText(this.t(key));
  }

  /**
   * The instance bar names the instance open, `name`; with `folder`, its
   * "Open in your Pod" leads to that folder, the instance's own.
   */
  async expectInstance(name: string, folder?: string): Promise<void> {
    await this.intent(`Check that the instance ${name} is open`, async () => {
      await expect(this.instanceNav.getByText(name, { exact: true })).toBeVisible();
      if (folder !== undefined)
        await expect(
          this.instanceNav.getByRole("link", { name: this.t("instanceBar.openInPod") }),
        ).toHaveAttribute("href", folder);
    });
  }

  /** Follows the instance bar's "Switch instance" to the instance picker. */
  async switchInstance(): Promise<void> {
    await this.intent("Switch instance", async () => {
      await this.instanceNav
        .getByRole("link", { name: this.t("instanceBar.switch"), exact: true })
        .click();
      await this.app.instancePicker.expectShown();
    });
  }

  /**
   * Opens Solid Memo at its own address, no screen named in it, as a
   * bookmark does: the session is restored and the app chooses where to
   * open by how many instances there are (one opens, more are offered).
   */
  async openAtItsAddress(): Promise<void> {
    await this.intent("Open Solid Memo at its address", async () => {
      await this.page.goto("./");
      await expect(this.breadcrumbs.locator('[aria-current="page"]')).toBeVisible({
        timeout: 30_000,
      });
    });
  }

  async openStatistics(): Promise<void> {
    await this.intent("Open Statistics", () =>
      this.instanceNav.getByRole("link", { name: this.t("instanceBar.statistics") }).click(),
    );
  }

  async openPreferences(): Promise<void> {
    await this.intent("Open Preferences", () =>
      this.instanceNav.getByRole("link", { name: this.t("instanceBar.preferences") }).click(),
    );
  }

  /**
   * Switches the app's language with the list above the masthead, choosing
   * the language by its name in itself; the page objects' text follows,
   * the list's own name ("Language", "Språk") with it.
   */
  async switchLanguage(locale: Locale): Promise<void> {
    const name = {
      en: "English",
      sv: "Svenska",
      ko: "한국어",
      de: "Deutsch",
      es: "Español",
      fr: "Français",
    }[locale];
    await this.intent(`Switch the language to ${name}`, async () => {
      await this.languageSelector.selectOption({ label: name });
      this.app.locale = locale;
      await expect(this.languageSelector).toHaveValue(locale);
    });
  }

  async logOut(): Promise<void> {
    await this.intent("Log out", async () => {
      await this.page
        .getByRole("banner")
        .getByRole("button", { name: this.t("app.logOut") })
        .click();
      await expect(
        this.page.getByRole("heading", { name: this.t("onboardingFlow.logInHeading") }),
      ).toBeVisible();
    });
  }
}
