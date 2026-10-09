import type { Course } from "@solid-memo/application/useCases";
import type { CompletedChaptersEdit } from "@solid-memo/domain/course";
import type { Deck, DeckDirection } from "@solid-memo/domain/deck";
import type { DeckAbout } from "@solid-memo/domain/deckAbout";
import type { DeckLanguages, StatedLanguages } from "@solid-memo/domain/deckLanguages";
import type { DeckPace } from "@solid-memo/domain/deckPace";
import type { DeckProvenance } from "@solid-memo/domain/deckProvenance";
import type { LangText } from "@solid-memo/domain/langText";
import type { StudyPreferences } from "@solid-memo/domain/preferences";
import { DeckAboutSection } from "@solid-memo/ui/DeckAboutSection";
import { DeckLanguagesSection } from "@solid-memo/ui/DeckLanguagesSection";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n, type ErrorText } from "@solid-memo/ui/i18n";
import type { ReadOnlyReason } from "@solid-memo/ui/dataCheck";
import { ReaderText } from "@solid-memo/ui/ReaderText";
import { CourseProgressSection } from "./CourseProgressSection";
import { DeckNameSection } from "./DeckNameSection";
import { DeckProvenanceSection } from "./DeckProvenanceSection";
import { DeckStudySection } from "./DeckStudySection";
import { ReadOnlyScope } from "./ReadOnly";

/**
 * What a deck says of itself, and how it is studied, each part with its
 * own form: its name; its description, topics and keywords (Solid Memo's
 * DeckAboutSection); its authors and licence; its direction and pace;
 * its card sides whose language is not stated (DeckLanguagesSection);
 * and, for a copy of a course (`course` not null), the learner's
 * progress through it. One status line says what the last save did, and
 * one error what went wrong. While the deck may not be changed
 * (`readOnly`), its forms are shown but held (ReadOnlyScope), with a
 * link to its health (`healthHref`).
 */
export function DeckAboutScreen({
  deck,
  appHref,
  readOnly,
  healthHref,
  preferences,
  preferencesHref,
  languages,
  languagesUnreadable,
  stated,
  course,
  busy,
  saved,
  error,
  onRename,
  onDescribe,
  onProvenance,
  onStudy,
  onStateLanguages,
  onCompletedChapters,
}: {
  deck: Deck;
  /** The deck's page in Solid Memo. */
  appHref: string;
  /** Why the deck may not be changed now (useDataCheck); null when it may. */
  readOnly: ReadOnlyReason | null;
  /** The deck's health, where data set aside is repaired. */
  healthHref: string;
  /** The instance's limits, which a limit the deck does not set follows. */
  preferences: Pick<StudyPreferences, "newCardsPerDay" | "maxReviewsPerDay">;
  /** The instance's preferences in Solid Memo. */
  preferencesHref: string;
  languages: DeckLanguages | undefined;
  languagesUnreadable: ErrorText | null;
  stated: number | null;
  /** For a copy of a course: the course as read, undefined while it is, and why it could not be. Null for any other deck. */
  course: { course: Course | undefined; unreadable: ErrorText | null } | null;
  busy: boolean;
  /** Whether the last save was made. */
  saved: boolean;
  error: ErrorText | null;
  onRename: (title: LangText) => void;
  onDescribe: (about: DeckAbout) => void;
  onProvenance: (provenance: DeckProvenance) => Promise<boolean>;
  onStudy: (direction: DeckDirection, pace: DeckPace) => void;
  onStateLanguages: (languages: StatedLanguages) => void;
  onCompletedChapters: (edit: CompletedChaptersEdit) => void;
}) {
  const { t, tx } = useI18n();
  return (
    <section>
      <header>
        <h2>{tx("studio.about.heading", { deck: <ReaderText text={deck.title} /> })}</h2>
        <a href={appHref}>{t("studio.about.openInApp")}</a>
      </header>
      <ReadOnlyScope reason={readOnly} subject="deck" healthHref={healthHref}>
        <DeckNameSection deck={deck} busy={busy} onRename={onRename} />
        <section aria-labelledby="deck-about-heading">
          <h3 id="deck-about-heading">{t("deckAbout.label")}</h3>
          <DeckAboutSection deck={deck} busy={busy} onSave={onDescribe} />
        </section>
        <DeckProvenanceSection deck={deck} busy={busy} onSave={onProvenance} />
        <DeckStudySection deck={deck} preferences={preferences} preferencesHref={preferencesHref} busy={busy} onSave={onStudy} />
        <DeckLanguagesSection
          deck={deck}
          languages={languages}
          unreadable={languagesUnreadable}
          busy={busy}
          stated={stated}
          onStateLanguages={onStateLanguages}
        />
        {course !== null && (
          <CourseProgressSection course={course.course} unreadable={course.unreadable} busy={busy} onEdit={onCompletedChapters} />
        )}
      </ReadOnlyScope>
      <p class="hint" role="status">
        {saved ? t("studio.about.saved") : ""}
      </p>
      <ErrorMessage error={error} />
    </section>
  );
}
