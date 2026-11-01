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

/** The folders of the user's own pod, as the credential gate asks for them. */
export interface OwnFolders {
  /** Their storages, and the folders they entered or made on this page. */
  storages: string[];
  /** The instances they registered, wherever they are. */
  instances: string[];
}

/**
 * The credential gate (docs/boundaries.md, "The credential gate"): a
 * fetch that is the user only in their own pod. A request to one of the
 * folders `ownFolders` gives for the logged-in WebID (their storages and
 * the instances they registered), or to a document or folder in one,
 * goes to `fetch`, the user's; to `instanceFetch`, the user's too, when
 * it is in an instance they registered outside their storages, which
 * anyone may make and another app may register; any other read goes to
 * `publicFetch`, as no one, and any other write is refused before it is
 * sent (`writeOutsidePod`). A catalog may name a deck's documents on any
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
  instanceFetch,
  publicFetch,
  webId,
  ownFolders,
  revision,
  now = Date.now,
}: {
  fetch: typeof globalThis.fetch;
  /** The user's fetch in an instance they registered outside their storages. */
  instanceFetch: typeof globalThis.fetch;
  publicFetch: typeof globalThis.fetch;
  /** The logged-in user's WebID, asked at each request; none when logged out. */
  webId: () => string | undefined;
  /** The folders whose documents are the user's to read and write as themselves. */
  ownFolders: (webId: string) => Promise<OwnFolders>;
  /** Moves whenever the page changes what `ownFolders` gives. */
  revision: () => number;
  now?: () => number;
}): typeof globalThis.fetch {
  /** The folders last asked: for whom, at which revision and when. */
  let known:
    | { webId: string; revision: number; at: number; folders: Promise<OwnFolders> }
    | undefined;

  function ask(user: string): Promise<OwnFolders> {
    const asked = { webId: user, revision: revision(), at: now(), folders: ownFolders(user) };
    known = asked;
    asked.folders.catch(() => {
      if (known === asked) known = undefined;
    });
    return asked.folders;
  }

  /** The user's fetch for `url`, as the folders say: none outside them. */
  async function whose(url: string): Promise<typeof globalThis.fetch | undefined> {
    const user = webId();
    if (user === undefined) return undefined;
    const inOne = (folders: string[]) => folders.some((folder) => isInFolder(url, folder));
    const fetchIn = ({ storages, instances }: OwnFolders) =>
      inOne(storages) ? fetch : inOne(instances) ? instanceFetch : undefined;
    const kept = known;
    if (kept?.webId !== user || kept.revision !== revision()) return fetchIn(await ask(user));
    const found = fetchIn(await kept.folders);
    if (found !== undefined || now() - kept.at < ASK_AGAIN_AFTER_MS) return found;
    return fetchIn(await ask(user));
  }

  return async (input, init) => {
    const url = urlOf(input);
    return send(await whose(url), publicFetch, url, input, init);
  };
}

/**
 * A fetch that is the user only where `isOwn` says: such a request goes
 * to `fetch`, the user's; any other read goes to `publicFetch`, and any
 * other write is refused before it is sent (`writeOutsidePod`).
 */
export function createFolderGate({
  fetch,
  publicFetch,
  isOwn,
}: {
  fetch: typeof globalThis.fetch;
  publicFetch: typeof globalThis.fetch;
  isOwn: (url: string) => boolean | Promise<boolean>;
}): typeof globalThis.fetch {
  return async (input, init) => {
    const url = urlOf(input);
    return send((await isOwn(url)) ? fetch : undefined, publicFetch, url, input, init);
  };
}

/** The address a request is sent to. */
function urlOf(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : String(input);
}

/**
 * A request to `url` sent with `own`, the user's fetch there; with none,
 * a read sent with `publicFetch` and any other request refused
 * (`writeOutsidePod`).
 */
function send(
  own: typeof globalThis.fetch | undefined,
  publicFetch: typeof globalThis.fetch,
  url: string,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<Response> {
  if (own !== undefined) return own(input, init);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (!READS.has(method))
    throw new AppError("writeOutsidePod", { host: new URL(url).host, method, url });
  return publicFetch(input, init);
}
