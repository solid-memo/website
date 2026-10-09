import type { ComponentChildren } from "preact";
import { distributionUrlOf } from "@solid-memo/domain/dcat";
import type { Card, Deck } from "@solid-memo/domain/deck";
import { cardSpotOf, healthProblemCount, type CardSpot, type DeckHealth } from "@solid-memo/domain/deckHealth";
import type { Instance } from "@solid-memo/domain/instance";
import type { RepairPlan, Unrepairable } from "@solid-memo/domain/repair";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import type { ValidationReport, Violation } from "@solid-memo/domain/validation";
import { cardName } from "@solid-memo/ui/DataText";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { ExternalLink } from "@solid-memo/ui/ExternalLink";
import { useI18n, type ErrorText, type I18n } from "@solid-memo/ui/i18n";
import { problemText, type MarkdownProblem } from "@solid-memo/ui/MarkdownEditing";
import { ReaderText } from "@solid-memo/ui/ReaderText";
import { repairLabels } from "@solid-memo/ui/RepairContainer";
import { summaryClass, summaryOf, ViolationMessage } from "@solid-memo/ui/ValidationScreen";

/** What can be repaired of what a check found, and the actions that repair it. */
export interface RepairActions {
  plan: RepairPlan;
  busy: boolean;
  onRepair: () => void;
  onRemove: (problem: Unrepairable) => void;
  error: ErrorText | null;
}

/** A subject of a check, and the predicate a result names, as a link to where it is fixed (or to the subject itself). */
type SubjectLink = (subjectUrl: string, path?: string) => ComponentChildren;

/**
 * What a check of the instance's documents found (`report`): its
 * summary, then each result, a violation or a warning, its subject as
 * `link` names it, then what Solid Memo can repair (one button for all),
 * and the subjects no repair covers, each to remove once the user
 * confirms (the container asks).
 */
function DataCheckSection({
  report,
  hint,
  link,
  repairs,
}: {
  report: ValidationReport;
  hint: string;
  link: SubjectLink;
  repairs: RepairActions;
}) {
  const { t, severityLabel } = useI18n();
  const labels = repairLabels(t);
  const results = report.documents.flatMap((document) =>
    document.subjects.flatMap((subject) =>
      subject.status === "checked" || subject.status === "profiled"
        ? subject.violations.filter((v) => v.severity !== "info").map((violation) => ({ subject: subject.url, violation }))
        : [],
    ),
  );
  const { plan, busy } = repairs;
  return (
    <section aria-labelledby="health-data">
      <h3 id="health-data">{t("studio.health.dataHeading")}</h3>
      <p class="hint">{hint}</p>
      <p class={summaryClass(report)}>{summaryOf(report, t)}</p>
      {results.length > 0 && (
        <ul class="studio-health-list">
          {results.map(({ subject, violation }, index) => (
            <li key={index}>
              {link(subject, violation.path)}: <Result violation={violation} severity={severityLabel(violation.severity)} />
            </li>
          ))}
        </ul>
      )}
      {plan.repairs.length > 0 && (
        <>
          <p>{t("repair.canRepair")}</p>
          <ul>
            {plan.repairs.map((repair) => (
              <li key={`${repair.kind} ${repair.subjectUrl}`}>
                {labels[repair.kind]}: {link(repair.subjectUrl)}
              </li>
            ))}
          </ul>
          <button class="primary" onClick={repairs.onRepair} disabled={busy}>
            {busy ? t("repair.repairing") : t("repair.repairButton", { count: plan.repairs.length })}
          </button>
        </>
      )}
      {plan.unrepairable.length > 0 && (
        <>
          <p>{t("studio.health.removeHint")}</p>
          <ul>
            {plan.unrepairable.map((problem) => (
              <li key={problem.subjectUrl}>
                {link(problem.subjectUrl)}{" "}
                <button
                  class="danger"
                  aria-label={t("studio.health.remove", { subject: problem.subjectUrl })}
                  onClick={() => repairs.onRemove(problem)}
                  disabled={busy}
                >
                  {t("repair.removeButton")}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <ErrorMessage error={repairs.error} />
    </section>
  );
}

/** One result of a check: its message, a warning saying so. */
function Result({ violation, severity }: { violation: Violation; severity: string }) {
  return (
    <>
      {violation.severity === "warning" && `${severity}: `}
      {violation.profile === "dcat-ap" && "DCAT-AP: "}
      <ViolationMessage violation={violation} />
    </>
  );
}

/** Where in a card a problem is, in words: "Water, note under the back". */
export function placeText(spot: CardSpot, t: I18n["t"], readerText: I18n["readerText"]): string {
  const card = cardName(spot.card, readerText);
  const { place } = spot;
  switch (place.tab) {
    case "schedule":
      return t("studio.health.place.schedule", { card });
    case "distractors":
      return t(
        place.part === "text" ? "studio.health.place.distractorText" : place.part === "note" ? "studio.health.place.distractorNote" : "studio.health.place.distractor",
        { card, id: place.distractor },
      );
    case "content":
      return place.part === undefined
        ? t("studio.health.place.card", { card })
        : t("studio.health.place.part", { card, part: t(`studio.health.part.${place.part}`) });
  }
}

/** A problem's place in a card, as a link to that field of the card inspector (`spotHref`); named only, with none. */
function SpotLink({ spot, spotHref, language }: { spot: CardSpot; spotHref: ((spot: CardSpot) => string) | null; language?: string }) {
  const { t, readerText, languageParts } = useI18n();
  const place = placeText(spot, t, readerText);
  const text = language === undefined || language === "" ? place : t("studio.health.language", { place, language: languageParts(language).name });
  return spotHref === null ? <>{text}</> : <a href={spotHref(spot)}>{text}</a>;
}

/** The heading of a part of the health screen, and what it says when nothing in it is wrong. */
function Part({ id, heading, fine, children }: { id: string; heading: string; fine: string | null; children?: ComponentChildren }) {
  return (
    <section aria-labelledby={id}>
      <h3 id={id}>{heading}</h3>
      {fine === null ? children : <p class="hint">{fine}</p>}
    </section>
  );
}

/**
 * Everything wrong with one deck (`health`, UseCases.checkDeck): a line
 * that counts it, then the check of its data (each result about a card
 * linking to the field of the card inspector it is about, the deck's
 * entry and its distribution to its about screen), the sides that state no language, the
 * cards that say the same, and the text in Markdown that would not show
 * as meant, each linking to its field (`spotHref`). "Check again" reads
 * it all afresh. While the deck is held (`held`: set aside, or the whole
 * instance blocked), its forms change nothing, so the places are named,
 * not linked, and a line says so: the repairs and removals here are the
 * way out.
 */
export function DeckHealthScreen({
  deck,
  health,
  cards,
  checking,
  onCheck,
  repairs,
  spotHref,
  aboutHref,
  held = false,
}: {
  deck: Deck;
  health: DeckHealth<MarkdownProblem>;
  /** The deck's cards, to name what the check of its data is about. */
  cards: readonly Card[];
  checking: boolean;
  onCheck: () => void;
  repairs: RepairActions;
  spotHref: (spot: CardSpot) => string;
  /** What the deck says of itself, where its entry and its languages are set. */
  aboutHref: string;
  /** Nothing in the deck can be changed until its data is repaired (useDataCheck). */
  held?: boolean;
}) {
  const { t, tx } = useI18n();
  const count = healthProblemCount(health);
  const about = (text: string) => (held ? text : <a href={aboutHref}>{text}</a>);
  const toSpot = held ? null : spotHref;
  const link: SubjectLink = (subjectUrl, path) => {
    if (subjectUrl === deck.url) return about(t("studio.health.deckEntry"));
    if (subjectUrl === distributionUrlOf(deck.url)) return about(t("studio.health.deckDistribution"));
    const spot = cardSpotOf(deck, cards, subjectUrl, path);
    return spot === null ? <ExternalLink url={subjectUrl} /> : <SpotLink spot={spot} spotHref={toSpot} />;
  };
  const unstated = health.unstated;
  return (
    <section>
      <header>
        <h2>{tx("studio.health.deckHeading", { deck: <ReaderText text={deck.title} /> })}</h2>
        <button type="button" onClick={onCheck} disabled={checking}>
          {checking ? t("studio.health.checking") : t("studio.health.checkAgain")}
        </button>
      </header>
      {/* Mounted throughout, so the count is heard each time a check ends. */}
      <p class={count === 0 ? "hint" : "warning"} role="status">
        {checking ? "" : count === 0 ? t("studio.health.allWell") : t("studio.health.summary", { count })}
      </p>
      {held && <p class="warning">{t("studio.health.held")}</p>}
      <DataCheckSection report={health.report} hint={t("studio.health.dataHint")} link={link} repairs={repairs} />
      <Part
        id="health-languages"
        heading={t("studio.health.languagesHeading")}
        fine={unstated === null ? t("studio.health.languagesUnchecked") : unstated.length === 0 ? t("studio.health.languagesFine") : null}
      >
        <p>
          {t("studio.health.unstated", { count: unstated?.length ?? 0 })} {!held && <a href={aboutHref}>{t("studio.health.unstatedLink")}</a>}
        </p>
        <ul class="studio-health-list">
          {unstated?.map((spot, index) => (
            <li key={index}>
              <SpotLink spot={spot} spotHref={toSpot} />
            </li>
          ))}
        </ul>
      </Part>
      <Part
        id="health-duplicates"
        heading={t("studio.health.duplicatesHeading")}
        fine={health.duplicates.length === 0 ? t("studio.health.duplicatesFine") : null}
      >
        <p class="hint">{t("studio.health.duplicatesHint")}</p>
        <ul class="studio-health-list">
          {health.duplicates.map((group) => (
            <li key={group[0]!.id}>
              {t("studio.health.duplicateGroup", { count: group.length })}{" "}
              {group.map((card, index) => (
                <span key={card.id}>
                  {index > 0 && ", "}
                  <SpotLink spot={{ card, place: { tab: "content" } }} spotHref={toSpot} />
                </span>
              ))}
            </li>
          ))}
        </ul>
      </Part>
      <Part
        id="health-markdown"
        heading={t("studio.health.markdownHeading")}
        fine={health.markdown.length === 0 ? t("studio.health.markdownFine") : null}
      >
        <p class="hint">{t("studio.health.markdownHint")}</p>
        <ul class="studio-health-list">
          {health.markdown.map((problem, index) => (
            <li key={index}>
              <SpotLink spot={problem} spotHref={toSpot} language={problem.language} />: {problemText(problem.finding, t)}
            </li>
          ))}
        </ul>
      </Part>
    </section>
  );
}

/**
 * Everything wrong with an instance: the check of its documents (as it
 * is made when the instance is opened; a result about a deck links to
 * that deck's health), and each deck, with its health as a badge,
 * checked once it is on the screen (`badge`), linking to its own.
 */
export function InstanceHealthScreen({
  instance,
  report,
  decks,
  checking,
  onCheck,
  repairs,
  deckHref,
  badge,
}: {
  instance: Instance;
  report: ValidationReport;
  decks: readonly Deck[];
  checking: boolean;
  onCheck: () => void;
  repairs: RepairActions;
  deckHref: (deck: Deck) => string;
  badge: (deck: Deck) => ComponentChildren;
}) {
  const { t, readerText } = useI18n();
  const link: SubjectLink = (subjectUrl) => {
    const document = documentUrlOf(subjectUrl);
    const deck = decks.find(
      (each) =>
        each.url === subjectUrl ||
        distributionUrlOf(each.url) === subjectUrl ||
        each.cardsDocumentUrl === document ||
        each.reviewsDocumentUrl === document,
    );
    return deck === undefined ? (
      <ExternalLink url={subjectUrl} />
    ) : (
      <>
        <ExternalLink url={subjectUrl} /> <a href={deckHref(deck)}>{t("studio.health.inDeck", { deck: readerText(deck.title) })}</a>
      </>
    );
  };
  return (
    <section>
      <header>
        <h2>{t("studio.health.heading", { instance: instance.name })}</h2>
        <button type="button" onClick={onCheck} disabled={checking}>
          {checking ? t("studio.health.checking") : t("studio.health.checkAgain")}
        </button>
      </header>
      <DataCheckSection report={report} hint={t("studio.health.instanceDataHint")} link={link} repairs={repairs} />
      <section aria-labelledby="health-decks">
        <h3 id="health-decks">{t("studio.health.decksHeading")}</h3>
        <p class="hint">{t("studio.health.decksHint")}</p>
        <ul class="studio-health-list">
          {decks.map((deck) => (
            <li key={deck.url}>
              <a href={deckHref(deck)}>
                <ReaderText text={deck.title} />
              </a>
              {badge(deck)}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
