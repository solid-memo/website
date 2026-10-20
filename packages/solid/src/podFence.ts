// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import { isSafeWriteUrl } from "@solid-memo/domain/instanceLayout";

/** Methods that only read; every other one writes. */
const READS = new Set(["GET", "HEAD", "OPTIONS"]);

/** A resource's own access control: its ACL or its ACR, beside it. */
const ACCESS_CONTROL = /\.(?:acl|acr)$/i;

/**
 * The pod fence (docs/boundaries.md, "The pod fence"): a wrapper of the
 * pod fetch that lets every read through and refuses a request of any
 * other method before it is sent (`writeRefused`) unless its address is
 * one Solid Memo may write to (isSafeWriteUrl): in canonical form, with
 * no dot segment, no empty segment, nothing encoded a server might read
 * as a step elsewhere, and not an access control or metadata resource.
 * Every pod adapter is given the fenced fetch, so whatever address a
 * pod's data names, no code path writes there around it.
 *
 * With `accessControl`, a write to a document's own ACL or ACR
 * (`<document>.acl`, `<document>.acr`) is let through too, when the
 * document's address passes, never a folder's: the fetch the release
 * publisher makes a release public with, which itself writes only the
 * release's own.
 */
export function createPodFence(
  inner: typeof globalThis.fetch,
  { accessControl = false }: { accessControl?: boolean } = {},
): typeof globalThis.fetch {
  return async (input, init) => {
    const request = input instanceof Request ? input : undefined;
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    if (!READS.has(method)) {
      const url = request?.url ?? String(input);
      // A document's own access control, never a folder's, which covers what is in it.
      const resource = accessControl ? url.replace(ACCESS_CONTROL, "") : url;
      if (!isSafeWriteUrl(resource) || (resource !== url && resource.endsWith("/")))
        throw new AppError("writeRefused", { method, url });
    }
    return inner(input, init);
  };
}
