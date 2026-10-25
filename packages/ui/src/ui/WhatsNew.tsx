// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createContext } from "preact";
import { useContext, useId, useState } from "preact/hooks";
import type { WhatsNewUseCases } from "@solid-memo/application/whatsNew";
import { HIGHLIGHTS, type Highlight } from "./highlights";
import { useI18n } from "./i18n";
import { usePanelFocus } from "./panelFocus";

/** The site's version (SiteSource.version), which the card of what is new names. */
export const AppVersion = createContext("");

const SPARKLES = 8;

/**
 * What is new in this version, above the deck list: the highlights not
 * yet shown, newest first, under a title that names the version, and a
 * Close button, named with the title, since another panel above the list
 * may have a Close of its own. A landmark named by its title, not a
 * heading, as the invitation to FSRS-6 is, so it takes none of the
 * screen's headings; it takes no focus, and when it is closed holding
 * focus, focus goes to the screen's first heading, the one after it
 * ("Your courses" when there are courses, else "Decks"; usePanelFocus).
 * A burst of sparkles, decorative, marks its arrival.
 */
export function WhatsNew({
  version,
  highlights,
  onDismiss,
}: {
  version: string;
  highlights: readonly Highlight[];
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const closeId = useId();
  const ref = usePanelFocus<HTMLElement>(false);
  return (
    <aside ref={ref} class="whats-new" aria-labelledby={titleId}>
      <span class="whats-new-sparkles" aria-hidden="true">
        {Array.from({ length: SPARKLES }, (_, sparkle) => (
          <span key={sparkle} style={{ "--angle": `${(sparkle * 360) / SPARKLES}deg` }} />
        ))}
      </span>
      <p id={titleId} class="whats-new-title">
        {t("whatsNew.heading", { version })}
      </p>
      <ul>
        {highlights.map((highlight) => (
          <li key={highlight.id}>{t(highlight.text)}</li>
        ))}
      </ul>
      <div class="edit-actions">
        <button id={closeId} aria-labelledby={`${closeId} ${titleId}`} onClick={onDismiss}>
          {t("whatsNew.close")}
        </button>
      </div>
    </aside>
  );
}

/**
 * Shows the highlights (HIGHLIGHTS, or those given) this browser has not
 * shown yet (unseenHighlights), until they are closed, which keeps them
 * all as seen; nothing when there are none, as on a first visit, which
 * is spared them. They are asked once a mount, so a first visit keeps
 * them once.
 */
export function WhatsNewContainer({
  useCases,
  highlights = HIGHLIGHTS,
}: {
  useCases: WhatsNewUseCases;
  highlights?: readonly Highlight[];
}) {
  const version = useContext(AppVersion);
  const ids = highlights.map(({ id }) => id);
  const [unseen, setUnseen] = useState(() => useCases.unseenHighlights(ids));
  const shown = highlights.filter(({ id }) => unseen.includes(id));
  if (shown.length === 0) return null;
  return (
    <WhatsNew
      version={version}
      highlights={shown}
      onDismiss={() => {
        useCases.dismissHighlights(ids);
        setUnseen([]);
      }}
    />
  );
}
