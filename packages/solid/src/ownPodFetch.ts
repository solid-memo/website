// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { isDocumentIn } from "@solid-memo/domain/instanceLayout";

/**
 * A fetch that is the user only in their own pod: a document in one of
 * the folders `ownFolders` gives for the logged-in WebID (their storages
 * and the instances they registered) is read with `fetch`, the user's,
 * and a redirect is then an error, so neither the browser nor the
 * login's fetch takes the credentials anywhere else; every other address
 * is read with `publicFetch`, as no one. Logged out, everything is.
 */
export function createOwnPodFetch({
  fetch,
  publicFetch,
  webId,
  ownFolders,
}: {
  fetch: typeof globalThis.fetch;
  publicFetch: typeof globalThis.fetch;
  /** The logged-in user's WebID, asked at each request; none when logged out. */
  webId: () => string | undefined;
  /** The folders whose documents are the user's to read as themselves. */
  ownFolders: (webId: string) => Promise<string[]>;
}): typeof globalThis.fetch {
  return async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const user = webId();
    const own =
      user !== undefined && (await ownFolders(user)).some((folder) => isDocumentIn(url, folder));
    return own ? fetch(input, { ...init, redirect: "error" }) : publicFetch(input, init);
  };
}
