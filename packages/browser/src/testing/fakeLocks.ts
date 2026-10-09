import type { Locks } from "../localStorageUpdateJournal";

/** Web Locks shared by the pages of a test: exclusive, granted in the order asked. */
export function fakeLocks(): Locks {
  const held = new Set<string>();
  const waiting = new Map<string, (() => void)[]>();
  const grant = (name: string, callback: LockGrantedCallback<unknown>, resolve: (value: unknown) => void) => {
    held.add(name);
    queueMicrotask(() => {
      void Promise.resolve(callback({ name, mode: "exclusive" })).then((value) => {
        held.delete(name);
        waiting.get(name)?.shift()?.();
        resolve(value);
      });
    });
  };
  const request = (
    name: string,
    second: LockOptions | LockGrantedCallback<unknown>,
    third?: LockGrantedCallback<unknown>,
  ): Promise<unknown> =>
    new Promise((resolve) => {
      const [options, callback] = typeof second === "function" ? [{}, second] : [second, third!];
      const queue = waiting.get(name) ?? [];
      waiting.set(name, queue);
      if (!held.has(name) && queue.length === 0) grant(name, callback, resolve);
      else if (options.ifAvailable === true) resolve(callback(null));
      else queue.push(() => grant(name, callback, resolve));
    });
  return { request } as Locks;
}
