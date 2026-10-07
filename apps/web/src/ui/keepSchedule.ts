import { useLayoutEffect, useRef } from "preact/hooks";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";

/**
 * For a screen that grades a deck's cards outside a study session (a
 * course's questions): once it has, the deck's schedule is kept in the
 * digest, and the answers given added to the log, as a study session's
 * end does (StudyContainer), when the screen goes away or (best effort)
 * the page is hidden. Returns what to call after each answer graded.
 */
export function useKeepSchedule(useCases: UseCases, instanceUrl: string, deck: Deck): () => void {
  const answered = useRef(0);
  const latest = useRef(deck);
  latest.current = deck;
  useLayoutEffect(() => {
    const keep = () => {
      if (answered.current === 0) return;
      answered.current = 0;
      void useCases.refreshStudyDigest(instanceUrl, latest.current).catch(() => undefined);
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") keep();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      keep();
    };
  }, [instanceUrl, deck.url]);
  return () => {
    answered.current++;
  };
}
