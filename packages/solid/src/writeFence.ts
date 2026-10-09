import type { WriteFence } from "@solid-memo/application/ports";
import { AppError } from "@solid-memo/domain/appError";

/** Methods that only read; every other one writes. */
const READS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * The WriteFence as a wrapper of the pod fetch: while a container is
 * held, every request under it that could write (PUT, POST, PATCH,
 * DELETE, …) is refused before it leaves the browser. Every adapter is
 * given the wrapped fetch, so no code path can write around it.
 */
export function createWriteFence(inner: typeof globalThis.fetch): WriteFence & { fetch: typeof globalThis.fetch } {
  const held = new Map<string, number>();
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
    fetch: async (input, init) => {
      const request = input instanceof Request ? input : undefined;
      const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
      if (!READS.has(method)) {
        const url = normalize(request?.url ?? String(input));
        for (const container of held.keys()) {
          if (url.startsWith(container)) throw new AppError("instanceBeingUpdated", { container, method, url });
        }
      }
      return inner(input, init);
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
