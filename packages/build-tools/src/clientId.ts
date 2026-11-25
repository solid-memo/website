// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

/**
 * The site's Client ID Document (Solid-OIDC 0.1.0, section 5.1), written
 * by the build from the domain in the repository's CNAME
 * (docs/authentication.md#the-client-id-document): its address is the
 * client ID the app logs in with on that domain, so a fork that writes
 * its own domain into CNAME gets its own. With no CNAME there is none,
 * and the app registers itself at each login.
 */

/** Where the document is served, at the site's root. */
export const CLIENT_ID_FILE = "clientid.jsonld";

/** The JSON-LD context Solid-OIDC defines, which providers look for word for word. */
const OIDC_CONTEXT = "https://www.w3.org/ns/solid/oidc-context.jsonld";

/** The client ID on `origin` (`https://` and the domain, no slash): the document's own address. */
export function clientIdUrl(origin: string): string {
  return `${origin}/${CLIENT_ID_FILE}`;
}

/**
 * The document for the site on `origin`, which calls itself `name`. It
 * lists one redirect URL, the site's root, as the app is one page and
 * sends the provider back to it (docs/authentication.md). It has no
 * terms of service, and no post-logout redirect, which the context
 * does not define and logout, which ends the session in this browser
 * alone, does not use.
 */
export function clientIdDocument(origin: string, name: string): string {
  const document = {
    "@context": [OIDC_CONTEXT],
    client_id: clientIdUrl(origin),
    client_name: name,
    redirect_uris: [`${origin}/`],
    client_uri: `${origin}/`,
    logo_uri: `${origin}/solid-memo-avatar.png`,
    scope: "openid offline_access webid",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    application_type: "web",
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * Emits the document into the build when there is an origin. `name` is
 * read as the bundle is written, once the build's settings are checked.
 * A copy in the public folder fails the build, as Vite would copy it
 * over the one written here.
 */
export function clientIdPlugin({
  origin,
  name,
}: {
  origin: string | null;
  name: () => string;
}): Plugin {
  let publicDir = "";
  return {
    name: "solid-memo:client-id",
    apply: "build",

    configResolved(config) {
      publicDir = config.publicDir;
    },

    generateBundle() {
      const copy = join(publicDir, CLIENT_ID_FILE);
      if (publicDir !== "" && existsSync(copy))
        throw new Error(
          `${copy}: the build writes ${CLIENT_ID_FILE} from CNAME (docs/authentication.md); delete this copy.`,
        );
      if (origin === null) return;
      this.emitFile({
        type: "asset",
        fileName: CLIENT_ID_FILE,
        source: clientIdDocument(origin, name()),
      });
    },
  };
}
