import type { ComponentChildren } from "preact";
import type { Current } from "./workspaceLayout";

/** A tab as a link: which it is, where it goes, what it says, and whether it is the one shown, or the page shown is under it. */
export interface TabLink<K extends string> {
  key: K;
  href: string;
  label: ComponentChildren;
  current: Current;
}

/**
 * Tabs as links in a row (`nav.studio-tabs`, named by `label`), the one
 * shown marked `aria-current="page"`, or "true" when the page shown is
 * under it (a card under a deck's Cards): a deck's or a draft's screens, the
 * card inspector's parts, the release check's policies. A link goes
 * where it says, a Back stop as any link is; with `onFollow`, the owner
 * goes there instead (without a Back stop, say).
 */
export function ContextTabs<K extends string>({
  label,
  tabs,
  onFollow,
}: {
  label: string;
  tabs: readonly TabLink<K>[];
  onFollow?: (key: K) => void;
}) {
  return (
    <nav class="studio-tabs" aria-label={label}>
      <ul>
        {tabs.map((tab) => (
          <li key={tab.key}>
            <a
              href={tab.href}
              aria-current={tab.current || undefined}
              onClick={
                onFollow &&
                ((event) => {
                  event.preventDefault();
                  onFollow(tab.key);
                })
              }
            >
              {tab.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
