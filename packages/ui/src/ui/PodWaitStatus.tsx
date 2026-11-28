// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useEffect, useState } from "preact/hooks";
import type { PodWait, PodWaitUseCases } from "@solid-memo/application/podWaits";
import { useI18n } from "./i18n";

/** How often the seconds left are counted again, in milliseconds. */
const TICK_MS = 1000;

/** The whole seconds from `now` until `wait` ends, at least 1 while it lasts. */
function secondsLeft(wait: PodWait, now: number): number {
  return Math.max(1, Math.ceil((wait.until.getTime() - now) / 1000));
}

/**
 * Tells the learner that a server asked Solid Memo to slow down, and in
 * how many seconds it tries again, one line per server whose wait lasts
 * (docs/architecture.md#a-request-on-its-way-to-a-pod). It holds nothing
 * up: the screen goes on, and its requests to that server wait. A
 * server's many failures with no status are told as a server not
 * answering, as the app can't tell whether it asked. The lines count
 * down each second; a polite live region tells a screen reader of each
 * wait once, as it starts or grows longer, not of each second.
 */
export function PodWaitStatus({ useCases }: { useCases: PodWaitUseCases }) {
  const { t } = useI18n();
  const [heard, setHeard] = useState(() => ({ waits: useCases.podWaits(), at: Date.now() }));
  const [now, setNow] = useState(heard.at);
  useEffect(
    () =>
      useCases.watchPodWaits(() => {
        const at = Date.now();
        setHeard({ waits: useCases.podWaits(), at });
        setNow(at);
      }),
    [useCases],
  );
  const lasting = heard.waits.filter((wait) => wait.until.getTime() > now);
  const waiting = lasting.length > 0;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [waiting]);
  const text = (wait: PodWait, at: number) =>
    t(wait.asked ? "podWait.asked" : "podWait.unanswered", {
      host: wait.host,
      seconds: secondsLeft(wait, at),
    });
  return (
    <div class="pod-waits" role="status">
      {lasting.map((wait) => (
        <p class="warning" key={wait.host}>
          <span aria-hidden="true">{text(wait, now)}</span>
          <span class="visually-hidden">{text(wait, heard.at)}</span>
        </p>
      ))}
    </div>
  );
}
