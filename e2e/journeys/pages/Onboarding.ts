import { expect } from "@playwright/test";
import { Screen } from "./Screen.ts";

/** The landing page and the WebID form, before anyone is logged in. */
export class Onboarding extends Screen {
  async visit(): Promise<void> {
    await this.intent("Visit Solid Memo", async () => {
      await this.page.goto("./");
      await expect(this.page.getByRole("button", { name: this.t("onboardingFlow.havePod") })).toBeVisible();
    });
  }

  /** Starts the login with a WebID; the browser goes on to its identity provider. */
  async logInWithWebId(webId: string): Promise<void> {
    await this.intent("Log in with the WebID", async () => {
      await this.page.getByRole("button", { name: this.t("onboardingFlow.havePod") }).click();
      await this.page.getByRole("textbox", { name: "WebID" }).fill(webId);
      await this.page.getByRole("button", { name: this.t("webIdForm.logIn") }).click();
    });
  }

  /** Back from the identity provider: the pod it found, then on. */
  async continueConnected(pod: string): Promise<void> {
    await this.intent("Continue with the connected Pod", async () => {
      await expect(this.page.getByRole("heading", { name: this.t("podConnection.connectedHeading") })).toBeVisible({ timeout: 30_000 });
      await expect(this.page.getByRole("main").locator(`a[href="${pod}"]`)).toBeVisible();
      await this.page.getByRole("button", { name: this.t("podConnection.continue") }).click();
    });
  }

  async expectLoggedOut(): Promise<void> {
    await expect(this.page.getByRole("heading", { name: this.t("onboardingFlow.connectHeading") })).toBeVisible();
    await expect(this.page.getByRole("textbox", { name: "WebID" })).toBeVisible();
  }
}
