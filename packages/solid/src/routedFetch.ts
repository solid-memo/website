// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * One fetch for two pods (docs/guest-mode.md): a request below `origin`
 * goes to `local` (the guest's pod on this device), every other one to
 * `remote`. The adapters see one fetch, so copying the guest's instance
 * into the user's pod is a copy from one URL to another, as any.
 */
export function routedFetch({
  origin,
  local,
  remote,
}: {
  origin: string;
  local: typeof globalThis.fetch;
  remote: typeof globalThis.fetch;
}): typeof globalThis.fetch {
  return (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    return url.startsWith(origin) ? local(input, init) : remote(input, init);
  };
}
