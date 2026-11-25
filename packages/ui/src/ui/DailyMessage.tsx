// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useContext, useState } from "preact/hooks";
import type { DeviceValueKind } from "@solid-memo/application/deviceValues";
import { studyDayOf } from "@solid-memo/domain/scheduling";
import {
  DAILY_MESSAGES,
  type DailyMessage as Message,
  type DailyMessageLink,
  messageOfDay,
} from "./dailyMessages";
import { useDeviceValues } from "./deviceValues";
import { ExternalLink } from "./ExternalLink";
import { useI18n } from "./i18n";
import { CloseIcon } from "./icons";
import { usePanelFocus } from "./panelFocus";
import { RepoUrl } from "./ReportMistake";

/** The key the day a daily message was put away on is kept under. */
export const DISMISSED_KEY = "solid-memo:dailyMessageDismissed";

/** The day kept, as its text ("YYYY-MM-DD"); none for anything else. */
const DISMISSED_DAY: DeviceValueKind<string | null> = {
  decode: (stored) => {
    const day = String(stored);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
  },
  fallback: null,
  text: true,
};

/**
 * A message's link: the About page's word on donating, a page of this
 * site in English only, which its label says in every other language, as
 * the footer's does; or the repository's Discussions or the repository
 * itself, in a new tab.
 */
function MessageLink({ link, repoUrl }: { link: DailyMessageLink; repoUrl: string }) {
  const { t } = useI18n();
  if (link === "donate") {
    return (
      <a href="about/#why" hreflang="en">
        {t("dailyMessage.link.donate")}
      </a>
    );
  }
  return link === "discussions" ? (
    <ExternalLink url={`${repoUrl}/discussions`}>{t("dailyMessage.link.discussions")}</ExternalLink>
  ) : (
    <ExternalLink url={repoUrl}>{t("dailyMessage.link.repository")}</ExternalLink>
  );
}

/**
 * The day's message, in a slim strip above the deck list: its sentence,
 * its link, and a button that puts it away for the rest of the day. A
 * landmark named for what it is, not a heading, so it takes none of the
 * screen's headings; it takes no focus, and when it is put away holding
 * focus, focus goes to the screen's first heading (usePanelFocus). A
 * link to the repository is left out where the site names none.
 */
export function DailyMessage({
  message,
  repoUrl,
  onDismiss,
}: {
  message: Message;
  repoUrl: string | null;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const ref = usePanelFocus<HTMLElement>(false);
  const link = message.link === "donate" || repoUrl !== null ? message.link : undefined;
  return (
    <aside ref={ref} class="daily-message" aria-label={t("dailyMessage.label")}>
      <p>
        {t(message.text)}
        {link !== undefined && (
          <>
            {" "}
            <MessageLink link={link} repoUrl={repoUrl!} />
          </>
        )}
      </p>
      <button
        class="icon"
        aria-label={t("dailyMessage.dismiss")}
        title={t("dailyMessage.dismiss")}
        onClick={onDismiss}
      >
        <CloseIcon />
      </button>
    </aside>
  );
}

/**
 * Today's message (messageOfDay of DAILY_MESSAGES, or those given), on
 * the days that have one, unless it was put away today on this device:
 * the day it was put away on is kept (DISMISSED_KEY), so the next day's
 * message shows. The day is the device's calendar day, taken once a
 * mount.
 */
export function DailyMessageContainer({
  messages = DAILY_MESSAGES,
  now = () => new Date(),
}: {
  messages?: readonly Message[];
  now?: () => Date;
}) {
  const dismissed = useDeviceValues().deviceValue(DISMISSED_KEY, DISMISSED_DAY);
  const repoUrl = useContext(RepoUrl);
  const [day] = useState(() => studyDayOf(now(), 0));
  const [shown, setShown] = useState(() => dismissed.read() !== day);
  const message = messageOfDay(day, messages);
  if (!shown || message === null) return null;
  return (
    <DailyMessage
      message={message}
      repoUrl={repoUrl}
      onDismiss={() => {
        dismissed.write(day);
        setShown(false);
      }}
    />
  );
}
