// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { PodProvider } from "@solid-memo/domain/podProvider";
import { useI18n } from "../i18n";
import { WebIdForm } from "./WebIdForm";

/**
 * Signed-out onboarding, all on one page: try the app as a guest
 * (docs/guest-mode.md), log in — by picking the provider to log in at, or
 * by typing a WebID — or create a Pod at a provider first. Login itself
 * happens on the identity provider's page; this flow only finds out which
 * provider that is. Logging in comes before creating a Pod, and before the
 * guest's offer too for someone who logged out here.
 */
export function OnboardingFlow({
  providers,
  busy,
  returning,
  onLogin,
  onLoginWithProvider,
  onTryAsGuest,
}: {
  providers: readonly PodProvider[];
  busy: boolean;
  /** Logged out here, or a guest logging in: logging in comes first. */
  returning: boolean;
  onLogin: (webId: string) => void;
  onLoginWithProvider: (provider: PodProvider) => void;
  /** Offered when given: study as a guest, without logging in. */
  onTryAsGuest?: () => void;
}) {
  const { t } = useI18n();
  const signUpProviders = providers.filter((provider) => provider.signUpUrl !== undefined);

  const logIn = (
    <section class="onboarding">
      <h2>{t("onboardingFlow.logInHeading")}</h2>
      <p class="hint">{t("onboardingFlow.providerHint")}</p>
      <div class="onboarding-actions">
        {providers.map((provider) => (
          <button key={provider.id} onClick={() => onLoginWithProvider(provider)} disabled={busy}>
            {provider.name}
          </button>
        ))}
      </div>
      <div class="webid-login">
        <h3>{t("onboardingFlow.webIdHeading")}</h3>
        <WebIdForm busy={busy} onSubmit={onLogin} />
      </div>
    </section>
  );

  // Without a provider to sign up at, there is nothing to offer for creating a Pod.
  const createPod = signUpProviders.length > 0 && (
    <section class="onboarding">
      <h2>{t("onboardingFlow.setUpHeading")}</h2>
      <p>{t("onboardingFlow.intro")}</p>
      <ul class="provider-list">
        {signUpProviders.map((provider) => (
          <li key={provider.id}>
            <span class="provider-name">{provider.name}</span>
            <a
              class="button"
              href={provider.signUpUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("onboardingFlow.createPodLabel", { provider: provider.name })}
            >
              {t("onboardingFlow.createPod")}
            </a>
          </li>
        ))}
      </ul>
      <p class="hint">{t("onboardingFlow.createPodHint")}</p>
    </section>
  );

  const guest = onTryAsGuest !== undefined && (
    <section class="onboarding guest-start">
      <h2>{t("onboardingFlow.tryHeading")}</h2>
      <p>{t("onboardingFlow.tryAsGuestHint")}</p>
      <button class="primary" onClick={onTryAsGuest} disabled={busy}>
        {t("onboardingFlow.tryAsGuest")}
      </button>
    </section>
  );

  return returning ? (
    <>
      {logIn}
      {guest}
      {createPod}
    </>
  ) : (
    <>
      {guest}
      {logIn}
      {createPod}
    </>
  );
}
