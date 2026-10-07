import { expect, type Locator } from "@playwright/test";
import type { Locale } from "../harness/strings.ts";
import { Screen } from "./Screen.ts";

/**
 * What is around every screen: the masthead (who is logged in, log out,
 * the language), the breadcrumbs, the instance's own links (statistics,
 * preferences) and, in developer mode, the developer tools.
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

  /** The masthead's language buttons ("English", "Svenska"): its group, not the one in Preferences. */
  get languageSelector(): Locator {
    return this.page.getByRole("banner").getByRole("group", { name: this.t("language.label") });
  }

  async expectLoggedInAs(webId: string): Promise<void> {
    await this.intent("Check who is logged in", async () => {
      await expect(this.page.getByRole("banner")).toContainText(this.t("app.loggedInAs", { name: "" }).trim());
      await expect(this.page.getByRole("banner").getByRole("link", { name: webId })).toBeVisible();
    });
  }

  /** Follows the breadcrumb named, and waits until the app is there (it is the current one). */
  async breadcrumb(key: string): Promise<void> {
    await this.intent(`Follow the breadcrumb ${this.t(key)}`, async () => {
      await this.breadcrumbs.getByRole("link", { name: this.t(key), exact: true }).click();
      await this.expectBreadcrumbHere(key);
    });
  }

  async expectBreadcrumbHere(key: string): Promise<void> {
    await expect(this.breadcrumbs.locator('[aria-current="page"]')).toHaveText(this.t(key));
  }

  async openStatistics(): Promise<void> {
    await this.intent("Open Statistics", () => this.instanceNav.getByRole("link", { name: this.t("instanceBar.statistics") }).click());
  }

  async openPreferences(): Promise<void> {
    await this.intent("Open Preferences", () => this.instanceNav.getByRole("link", { name: this.t("instanceBar.preferences") }).click());
  }

  /**
   * Switches the app's language with the masthead's selector; the page
   * objects' text follows. The selector's own name changes with it
   * ("Language", "Språk"), so the button is found by its name alone.
   */
  async switchLanguage(locale: Locale): Promise<void> {
    const name = { en: "English", sv: "Svenska" }[locale];
    await this.intent(`Switch the language to ${name}`, async () => {
      await this.page.getByRole("banner").getByRole("button", { name, exact: true }).click();
      this.app.locale = locale;
      await expect(this.languageSelector.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
    });
  }

  async logOut(): Promise<void> {
    await this.intent("Log out", async () => {
      await this.page.getByRole("banner").getByRole("button", { name: this.t("app.logOut") }).click();
      await expect(this.page.getByRole("heading", { name: this.t("onboardingFlow.connectHeading") })).toBeVisible();
    });
  }
}
