// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { APIRequestContext } from "@playwright/test";
import type { CssAccount } from "./cssAccount.ts";
import { bearer } from "./podDump.ts";

/**
 * An app other than Solid Memo, acting for the journey's WebID in its
 * pod with the account's client credentials, not through the browser:
 * what puts files of its own in a folder Solid Memo also uses, which
 * Solid Memo must then leave be (docs/data-model.md "Deleting an
 * instance").
 */
export interface OtherApp {
  /** Writes a document of its own at `url`, made or replaced. */
  put(url: string, body: string, contentType: string): Promise<void>;
  /** The status the pod answers a read of `url` with: 200 while it is there, 404 once it is gone. */
  status(url: string): Promise<number>;
}

/** The other app, its requests made with `api` (which must accept the server's certificate). */
export function otherApp(api: APIRequestContext, server: string, account: CssAccount): OtherApp {
  let token: Promise<string> | undefined;
  const headers = async () => ({
    authorization: `Bearer ${await (token ??= bearer(api, server, account))}`,
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
    async status(url) {
      return (await api.get(url, { headers: await headers() })).status();
    },
  };
}
