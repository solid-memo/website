// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { APIRequestContext } from "@playwright/test";
import type { CssAccount } from "./cssAccount.ts";
import { containedIn } from "./podDump.ts";
import { podToken } from "./podToken.ts";

/**
 * An app other than Solid Memo, acting for the journey's WebID in its
 * pod with a token of the account's own (podToken.ts), not through the
 * browser: what puts files of its own in a folder Solid Memo also uses, which
 * Solid Memo must then leave be (docs/data-model.md "Deleting an
 * instance"). It also reads what the pod holds, as plain requests see it:
 * what a journey checks the app wrote, or left.
 */
export interface OtherApp {
  /** Writes a document of its own at `url`, made or replaced. */
  put(url: string, body: string, contentType: string): Promise<void>;
  /** The document at `url`, as the pod serves it as Turtle. */
  read(url: string): Promise<string>;
  /** The status the pod answers a read of `url` with: 200 while it is there, 404 once it is gone. */
  status(url: string): Promise<number>;
  /**
   * The document at `url` as N-Triples, one triple a line, every IRI
   * absolute: its lines, or null while there is none (404).
   */
  triples(url: string): Promise<string[] | null>;
  /** What the container at `container` holds, by address; none while there is no container (404). */
  contents(container: string): Promise<string[]>;
}

/** The other app, its requests made with `api` (which must accept the server's certificate). */
export function otherApp(api: APIRequestContext, server: string, account: CssAccount): OtherApp {
  let token: Promise<string> | undefined;
  const headers = async () => ({
    authorization: `Bearer ${await (token ??= podToken(api, server, account))}`,
  });
  return {
    async put(url, body, contentType) {
      const response = await api.put(url, {
        headers: { ...(await headers()), "content-type": contentType },
        data: body,
      });
      if (!response.ok())
        throw new Error(
          `The other app could not write ${url}: ${response.status()} ${await response.text()}`,
        );
    },
    async read(url) {
      const response = await api.get(url, {
        headers: { ...(await headers()), accept: "text/turtle" },
      });
      if (!response.ok())
        throw new Error(
          `The other app could not read ${url}: ${response.status()} ${await response.text()}`,
        );
      return response.text();
    },
    async status(url) {
      return (await api.get(url, { headers: await headers() })).status();
    },
    async triples(url) {
      const response = await api.get(url, {
        headers: { ...(await headers()), accept: "application/n-triples" },
      });
      if (response.status() === 404) return null;
      if (!response.ok())
        throw new Error(
          `The other app could not read ${url}: ${response.status()} ${await response.text()}`,
        );
      return (await response.text()).split("\n").filter((line) => line.trim() !== "");
    },
    async contents(container) {
      const response = await api.get(container, {
        headers: { ...(await headers()), accept: "application/ld+json" },
      });
      if (response.status() === 404) return [];
      if (!response.ok())
        throw new Error(
          `The other app could not list ${container}: ${response.status()} ${await response.text()}`,
        );
      return containedIn(await response.json(), container);
    },
  };
}
