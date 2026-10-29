// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { POD_PROVIDERS } from "./podProvider";
import { isSecureUrl } from "./webId";

describe("POD_PROVIDERS", () => {
  it("offers every suggested provider for creating a Pod", () => {
    expect(POD_PROVIDERS.map(({ id, signUpUrl }) => ({ id, signUpUrl }))).toEqual([
      {
        id: "solidcommunity",
        signUpUrl: "https://solidcommunity.net/.account/login/password/register/",
      },
      { id: "inrupt", signUpUrl: "https://start.inrupt.com/" },
      { id: "solidweb", signUpUrl: "https://solidweb.me/.account/login/password/register/" },
    ]);
  });

  it("only suggests https issuers and sign-up pages, with unique ids", () => {
    for (const provider of POD_PROVIDERS) {
      expect(isSecureUrl(provider.oidcIssuer)).toBe(true);
      if (provider.signUpUrl !== undefined) {
        expect(isSecureUrl(provider.signUpUrl)).toBe(true);
      }
    }
    expect(new Set(POD_PROVIDERS.map((p) => p.id)).size).toBe(POD_PROVIDERS.length);
  });
});
