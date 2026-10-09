import type { WriteFence } from "@solid-memo/application/ports";
import { AppError } from "@solid-memo/domain/appError";
import { currentVersion, ifMatchOf } from "./documentVersion";

/** Methods that only read; every other one writes. */
const READS = new Set(["GET", "HEAD", "OPTIONS"]);

/** A pass: the URL it lets writes through to, and the version its document's first write is held to. */
interface Pass {
  url: string;
  version?: string;
}

/**
 * The WriteFence as a wrapper of the pod fetch: while a container (or a
 * document) is held, every request under it (or to it) that could write
 * (PUT, POST, PATCH, DELETE, …) is refused before it leaves the browser,
 * unless a pass lets it through. Every adapter is given the wrapped
 * fetch, so no code path can write around it.
 *
 * A pass with a version holds the first write to its document that the
 * pod accepts to that version, whatever version the writer read: an ETag
 * goes in `If-Match` (replacing the writer's own), so the pod refuses the
 * write (412) when the document changed since; any other version (a
 * weak ETag, a modification time, a hash, where the pod gives no ETag) is
 * compared with the document's version just before the write, and the
 * fence answers 412 itself when they differ. That check and the write
 * are two requests: a change made between them is not seen.
 */
export function createWriteFence(inner: typeof globalThis.fetch): WriteFence & { fetch: typeof globalThis.fetch } {
  const held = new Map<string, number>();
  const passes = new Set<Pass>();
  return {
    hold(containerUrl) {
      const key = normalize(containerUrl);
      held.set(key, (held.get(key) ?? 0) + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const count = held.get(key)! - 1;
        if (count === 0) held.delete(key);
        else held.set(key, count);
      };
    },
    pass(url, version) {
      const entry: Pass = { url: normalize(url), ...(version === undefined ? {} : { version }) };
      passes.add(entry);
      return () => {
        passes.delete(entry);
      };
    },
    fetch: async (input, init) => {
      const request = input instanceof Request ? input : undefined;
      const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
      if (READS.has(method)) return inner(input, init);
      const url = normalize(request?.url ?? String(input));
      const passing = [...passes].filter((entry) => url.startsWith(entry.url));
      if (passing.length === 0) {
        for (const container of held.keys()) {
          if (url.startsWith(container)) {
            throw container.endsWith("/")
              ? new AppError("instanceBeingUpdated", { container, method, url })
              : new AppError("deckBeingUpgraded", { document: container, method, url });
          }
        }
      }
      const pinned = passing.find((entry) => entry.url === url && entry.version !== undefined);
      if (pinned === undefined) return inner(input, init);
      const version = pinned.version!;
      const etag = ifMatchOf(version);
      let sent = init;
      if (etag === undefined) {
        if ((await currentVersion(url, inner)) !== version) return new Response(null, { status: 412 });
      } else {
        const headers = new Headers(init?.headers ?? request?.headers);
        headers.set("If-Match", etag);
        sent = { ...init, headers };
      }
      const response = await inner(input, sent);
      if (response.ok) delete pinned.version;
      return response;
    },
  };
}

/** One spelling per URL: resolved, with percent-encoding undone where it can be. */
function normalize(url: string): string {
  const href = new URL(url).href;
  try {
    return decodeURI(href);
  } catch {
    return href;
  }
}
