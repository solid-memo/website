import { useRef, useState } from "preact/hooks";
import {
  instancePrefs,
  NO_INSTANCE_PREFS,
  rememberInstancePrefs,
  type InstancePrefs,
} from "./prefs";

/**
 * What the device keeps of the open instance (prefs.ts): its saved
 * views, its pins and the decks and drafts opened last, none without an
 * instance open; and a change of them (`change`), kept on the device and
 * held for the page's life, so it holds there too when the storage
 * refuses it. Each instance's is read once, as it is first open.
 */
export function useInstancePrefs(instanceUrl: string | null): {
  prefs: InstancePrefs;
  change: (update: (prefs: InstancePrefs) => InstancePrefs) => void;
} {
  const held = useRef(new Map<string, InstancePrefs>());
  const [, rerender] = useState(0);
  const read = (url: string) => {
    if (!held.current.has(url)) held.current.set(url, instancePrefs(url));
    return held.current.get(url)!;
  };
  return {
    prefs: instanceUrl === null ? NO_INSTANCE_PREFS : read(instanceUrl),
    change: (update) => {
      const next = update(read(instanceUrl!));
      held.current.set(instanceUrl!, next);
      rememberInstancePrefs(instanceUrl!, next);
      rerender((count) => count + 1);
    },
  };
}
