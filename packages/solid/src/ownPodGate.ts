// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import { isInFolder } from "@solid-memo/domain/instanceLayout";

/** Methods that only read; every other one writes. */
const READS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * How long the folders are kept before an address outside them has them
 * asked again: another tab or app may have registered an instance since.
 */
const ASK_AGAIN_AFTER_MS = 60_000;

/**
 * The credential gate (docs/boundaries.md, "The credential gate"): a
 * fetch that is the user only in their own pod. A request to one of the
 * folders `ownFolders` gives for the logged-in WebID (their storages and
 * the instances they registered), or to a document or folder in one,
 * goes to `fetch`, the user's; any other read goes to `publicFetch`, as
 * no one, and any other write is refused before it is sent
 * (`writeOutsidePod`). A catalog may name a deck's documents on any
 * server, and what such a document says of itself (ownership.ts) never
 * makes it the user's. Logged out, nothing is the user's.
 *
 * The folders are asked once a WebID and kept until `revision` moves,
 * which the page does when it adds a folder or an instance or removes
 * one, so a change made here counts at once. An address outside them has
 * them asked again at most once a minute, for a change made elsewhere. A
 * failed ask fails the request and is not kept.
 */
export function createOwnPodGate({
  fetch,
  publicFetch,
  webId,
  ownFolders,
  revision,
  now = Date.now,
}: {
  fetch: typeof globalThis.fetch;
  publicFetch: typeof globalThis.fetch;
  /** The logged-in user's WebID, asked at each request; none when logged out. */
  webId: () => string | undefined;
  /** The folders whose documents are the user's to read and write as themselves. */
  ownFolders: (webId: string) => Promise<string[]>;
  /** Moves whenever the page changes what `ownFolders` gives. */
  revision: () => number;
  now?: () => number;
}): typeof globalThis.fetch {
  /** The folders last asked: for whom, at which revision and when. */
  let known:
    | { webId: string; revision: number; at: number; folders: Promise<string[]> }
    | undefined;

  function ask(user: string): Promise<string[]> {
    const asked = { webId: user, revision: revision(), at: now(), folders: ownFolders(user) };
    known = asked;
    asked.folders.catch(() => {
      if (known === asked) known = undefined;
    });
    return asked.folders;
  }

  async function isOwn(url: string): Promise<boolean> {
    const user = webId();
    if (user === undefined) return false;
    const inOne = (folders: string[]) => folders.some((folder) => isInFolder(url, folder));
    const kept = known;
    if (kept?.webId !== user || kept.revision !== revision()) return inOne(await ask(user));
    if (inOne(await kept.folders)) return true;
    return now() - kept.at >= ASK_AGAIN_AFTER_MS && inOne(await ask(user));
  }

  return async (input, init) => {
    const request = input instanceof Request ? input : undefined;
    const url = request?.url ?? String(input);
    if (await isOwn(url)) return fetch(input, init);
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    if (!READS.has(method))
      throw new AppError("writeOutsidePod", { host: new URL(url).host, method, url });
    return publicFetch(input, init);
  };
}
