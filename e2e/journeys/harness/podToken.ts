// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createHash, randomUUID } from "node:crypto";
import type { APIRequestContext, APIResponse } from "@playwright/test";
import type { CssAccount } from "./cssAccount.ts";
import { SERVER } from "./cssServer.ts";

/**
 * A Bearer token for the account's WebID in its pod, which the harness
 * reads and writes it with outside the browser (podDump.ts, otherApp.ts,
 * pod-safety's documents of the user's own). On a Community Solid Server,
 * from the account's client credentials. A Linked Web Storage server
 * takes only a token its own authorization server issues for an OpenID
 * Connect ID token, which client credentials don't give: there the
 * account logs in on the authorization-code flow, and its ID token is
 * exchanged for one, as the app's client does (docs/lws.md#sign-in).
 */
export function podToken(
  api: APIRequestContext,
  server: string,
  account: CssAccount,
): Promise<string> {
  return SERVER.lws ? lwsToken(api, server, account) : clientCredentialsToken(api, server, account);
}

/** A token for the account's WebID, by its client credentials. */
async function clientCredentialsToken(
  api: APIRequestContext,
  server: string,
  account: CssAccount,
): Promise<string> {
  const basic = Buffer.from(
    `${encodeURIComponent(account.client.id)}:${encodeURIComponent(account.client.secret)}`,
  ).toString("base64");
  const { access_token } = await answered<{ access_token: string }>(
    "The token endpoint refused the client credentials",
    await api.post(new URL(".oidc/token", server).href, {
      headers: { authorization: `Basic ${basic}` },
      form: { grant_type: "client_credentials", scope: "webid" },
    }),
  );
  return access_token;
}

/** Where the login is sent back to: never reached, its code read from the address. */
const REDIRECT_URI = "https://journeys.example/callback";

/**
 * The storage's token: the account logged in as the server's pages would
 * (a client registered, the login, the WebID picked, the consent, the
 * code redeemed), its ID token exchanged for the pod. The login's cookies
 * stay in `api`, which is never the browser's.
 */
async function lwsToken(api: APIRequestContext, server: string, account: CssAccount) {
  const provider = await answered<{
    registration_endpoint: string;
    authorization_endpoint: string;
    token_endpoint: string;
  }>(
    "Reading the provider",
    await api.get(new URL(".well-known/openid-configuration", server).href),
  );
  const { client_id: clientId } = await answered<{ client_id: string }>(
    "Registering a client",
    await api.post(provider.registration_endpoint, {
      data: {
        redirect_uris: [REDIRECT_URI],
        response_types: ["code"],
        grant_types: ["authorization_code"],
        token_endpoint_auth_method: "none",
        application_type: "web",
        scope: "openid webid",
      },
    }),
  );
  const verifier = randomUUID() + randomUUID();
  const follow = async (start: string) => {
    let next = new URL(start, server);
    for (let hop = 0; hop < 8; hop++) {
      if (next.href.startsWith(REDIRECT_URI) || next.pathname.startsWith("/.account/")) return next;
      const response = await api.get(next.href, { maxRedirects: 0 });
      const location = response.headers().location;
      if (location === undefined)
        throw new Error(`The login stopped at ${next.pathname}: ${response.status()}`);
      next = new URL(location, next);
    }
    throw new Error(`The login never came back, ending at ${next.href}.`);
  };
  const step = async (path: string, data: unknown) =>
    follow(
      (
        await answered<{ location: string }>(
          `Answering ${path}`,
          await api.post(new URL(`.account/${path}`, server).href, { data }),
        )
      ).location,
    );
  const authorize = new URL(provider.authorization_endpoint);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: "openid webid",
    state: randomUUID(),
    nonce: randomUUID(),
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  await follow(authorize.href);
  await step("login/password/", { email: account.email, password: account.password });
  await step("oidc/pick-webid/", { webId: account.webId });
  const back = await step("oidc/consent/", { remember: false });
  const { id_token: idToken } = await answered<{ id_token: string }>(
    "Redeeming the code",
    await api.post(provider.token_endpoint, {
      form: {
        grant_type: "authorization_code",
        client_id: clientId,
        code: back.searchParams.get("code") ?? "",
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      },
    }),
  );
  const { access_token } = await answered<{ access_token: string }>(
    "Exchanging the ID token",
    await api.post(new URL(".well-known/lws/token", server).href, {
      form: {
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        resource: account.pod,
        subject_token: idToken,
        subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      },
    }),
  );
  return access_token;
}

/** The JSON a request answered, or an error saying what was refused. */
async function answered<T>(what: string, response: APIResponse): Promise<T> {
  if (!response.ok()) throw new Error(`${what}: ${response.status()} ${await response.text()}`);
  return (await response.json()) as T;
}
