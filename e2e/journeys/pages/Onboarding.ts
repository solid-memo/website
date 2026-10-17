// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator } from "@playwright/test";
import { escapeRegExp } from "../harness/strings.ts";
import { Screen } from "./Screen.ts";

/** The landing page and the WebID form, before anyone is logged in. */
export class Onboarding extends Screen {
  async visit(): Promise<void> {
    await this.intent("Visit Solid Memo", async () => {
      await this.page.goto("./");
      await this.expectStart();
    });
  }

  /** Expects the landing page's first step, as on a first visit: "I already have a Pod" and the rest. */
  async expectStart(): Promise<void> {
    await expect(
      this.page.getByRole("button", { name: this.t("onboardingFlow.havePod") }),
    ).toBeVisible();
  }

  private get webIdField(): Locator {
    return this.page.getByRole("textbox", { name: "WebID" });
  }

  /** Starts the login with a WebID; the browser goes on to its identity provider. */
  async logInWithWebId(webId: string): Promise<void> {
    await this.intent("Log in with the WebID", async () => {
      await this.page.getByRole("button", { name: this.t("onboardingFlow.havePod") }).click();
      await this.submitWebId(webId);
    });
  }

  /**
   * Starts the login with a WebID where the WebID form is already shown,
   * as it is to someone who logged out here.
   */
  async logInAgainWithWebId(webId: string): Promise<void> {
    await this.intent("Log in again with the WebID", async () => {
      await this.expectLoggedOut();
      await this.submitWebId(webId);
    });
  }

  /**
   * Submits a WebID the form does not accept: it stays, the field marked
   * invalid and described by the error (errors.<code>).
   */
  async submitRefusedWebId(webId: string, code: string): Promise<void> {
    await this.intent(`Submit the WebID ${webId}, which is refused`, async () => {
      await this.submitWebId(webId);
      await expect(this.webIdField).toHaveAttribute("aria-invalid", "true");
      await expect(this.webIdField).toHaveAccessibleDescription(
        new RegExp(`^${escapeRegExp(this.t(`errors.${code}`))}`),
      );
      await expect(this.webIdField).toBeFocused();
    });
  }

  private async submitWebId(webId: string): Promise<void> {
    await this.webIdField.fill(webId);
    await this.page.getByRole("button", { name: this.t("webIdForm.logIn") }).click();
  }

  /** Back from the identity provider: the pod it found, then on. */
  async continueConnected(pod: string): Promise<void> {
    await this.intent("Continue with the connected Pod", async () => {
      await expect(
        this.page.getByRole("heading", { name: this.t("podConnection.connectedHeading") }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(this.page.getByRole("main").locator(`a[href="${pod}"]`)).toBeVisible();
      await this.page.getByRole("button", { name: this.t("podConnection.continue") }).click();
    });
  }

  async expectLoggedOut(): Promise<void> {
    await expect(
      this.page.getByRole("heading", { name: this.t("onboardingFlow.connectHeading") }),
    ).toBeVisible();
    await expect(this.webIdField).toBeVisible();
  }
}
