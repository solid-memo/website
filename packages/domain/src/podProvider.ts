// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A Solid Pod provider the app can suggest. Providers are data only: login
 * and Pod discovery are driven by the WebID / OIDC issuer, so no provider
 * needs code of its own.
 */
export interface PodProvider {
  id: string;
  name: string;
  /**
   * The provider's Solid-OIDC issuer: lets a user log in by picking the
   * provider instead of typing their WebID.
   */
  oidcIssuer: string;
  /** Page where a new user creates a Pod; absent = not offered for sign-up. */
  signUpUrl?: string;
}

/**
 * Providers suggested during onboarding. Add an entry to suggest another.
 * Issuers are the exact values each provider advertises in its
 * /.well-known/openid-configuration, which `npm run check:providers`
 * checks weekly, with each sign-up page (docs/testing.md#pod-providers).
 * Each sends the `iss` parameter on its answers, without which the app
 * refuses a login (docs/authentication.md#the-issuer-on-the-providers-answer).
 */
export const POD_PROVIDERS: readonly PodProvider[] = [
  {
    id: "solidcommunity",
    name: "solidcommunity.net",
    oidcIssuer: "https://solidcommunity.net/",
    signUpUrl: "https://solidcommunity.net/.account/login/password/register/",
  },
  {
    id: "inrupt",
    name: "Inrupt PodSpaces",
    oidcIssuer: "https://login.inrupt.com",
    signUpUrl: "https://start.inrupt.com/",
  },
  {
    id: "solidweb",
    name: "solidweb.me",
    oidcIssuer: "https://solidweb.me/",
    signUpUrl: "https://solidweb.me/.account/login/password/register/",
  },
];
