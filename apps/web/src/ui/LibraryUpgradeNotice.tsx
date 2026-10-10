import { activeCards } from "@solid-memo/domain/deck";
import type { LibraryUpgradePlan } from "@solid-memo/domain/libraryUpgrade";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type I18n, type ErrorText } from "./i18n";

/**
 * "adds 1 card, changes 2 cards, retires 1 card and removes 1 card", of
 * what the plan does to the cards the user studies: a card that is added
 * or changed retired is out of sight. Cards, and what the deck says of
 * itself, already as the release has them (an upgrade cut off half-way)
 * are said to be kept so; a course's chapters, steps and theory, and
 * the questions the learner has not reached, when they change, are said
 * to be updated.
 */
export function describeChanges(
  plan: LibraryUpgradePlan,
  { t, directionLabel }: Pick<I18n, "t" | "directionLabel">,
): string {
  const added = activeCards(plan.add).length;
  const changed = activeCards(plan.change).length;
  const parts = [
    ...(added > 0 ? [t("libraryUpgradeNotice.adds", { count: added })] : []),
    ...(changed > 0 ? [t("libraryUpgradeNotice.changes", { count: changed })] : []),
    ...(plan.retire.length > 0 ? [t("libraryUpgradeNotice.retires", { count: plan.retire.length })] : []),
    ...(plan.restore.length > 0 ? [t("libraryUpgradeNotice.bringsBack", { count: plan.restore.length })] : []),
    ...(plan.remove.length > 0 ? [t("libraryUpgradeNotice.removes", { count: plan.remove.length })] : []),
    ...(plan.applied.length > 0 ? [t("libraryUpgradeNotice.alreadyApplied", { count: plan.applied.length })] : []),
    ...(plan.appliedAbout.length > 0 ? [t("libraryUpgradeNotice.alreadyDescribed")] : []),
    ...(plan.direction === undefined
      ? []
      : [t("libraryUpgradeNotice.studies", { direction: directionLabel(plan.direction).toLowerCase() })]),
    ...([plan.title, plan.description, plan.keywords, plan.themes].some((value) => value !== undefined)
      ? [t("libraryUpgradeNotice.describes")]
      : []),
    ...(plan.outline === true ? [t("libraryUpgradeNotice.outline")] : []),
    ...(plan.unreached === true ? [t("libraryUpgradeNotice.unreached")] : []),
  ];
  if (parts.length === 0) return t("libraryUpgradeNotice.noStudiedChanges");
  return parts.length === 1
    ? parts[0]
    : t("libraryUpgradeNotice.list", {
        items: parts.slice(0, -1).join(t("libraryUpgradeNotice.listSeparator")),
        last: parts[parts.length - 1],
      });
}

/**
 * "Your review history is kept…", with the exceptions the plan makes: the
 * cards it removes, and those the copy no longer has (`gone`), whose
 * states left, if any, go too.
 */
function historyKept(plan: LibraryUpgradePlan, t: I18n["t"]): string {
  const removes = plan.remove.length + plan.gone.length > 0;
  const retires = plan.retire.length > 0;
  if (removes && retires) return t("libraryUpgradeNotice.historyKeptButRemovedRetired");
  if (removes) return t("libraryUpgradeNotice.historyKeptButRemoved");
  if (retires) return t("libraryUpgradeNotice.historyKeptRetired");
  return t("libraryUpgradeNotice.historyKept");
}

/**
 * Tells the user the library has a newer release of their imported
 * deck, what changed in it, what updating would do to their copy, and
 * lets them do so. Nothing happens until they do.
 */
export function LibraryUpgradeNotice({
  deckName,
  deckLang,
  plan,
  busy,
  error,
  onUpgrade,
}: {
  deckName: string;
  /** The language the deck's name is in, when not the page's (readerLang). */
  deckLang?: string;
  plan: LibraryUpgradePlan;
  busy: boolean;
  error: ErrorText | null;
  onUpgrade: () => void;
}) {
  const i18n = useI18n();
  const { t, tx } = i18n;
  return (
    <div class="warning migration" role="region" aria-label={t("libraryUpgradeNotice.region")}>
      <p>
        <strong>{t("libraryUpgradeNotice.heading")}</strong>{" "}
        {tx("libraryUpgradeNotice.body", {
          deck: <span lang={deckLang}>{deckName}</span>,
          from: plan.fromVersion,
          to: plan.toVersion,
          changes: describeChanges(plan, i18n),
        })}{" "}
        {historyKept(plan, t)}
        {plan.kept.length > 0 && ` ${t("libraryUpgradeNotice.kept", { count: plan.kept.length })}`}
      </p>
      {plan.notes.length > 0 && (
        <ul>
          {plan.notes.map((note) => (
            <li key={note.version}>
              {t("libraryUpgradeNotice.releaseNote", { version: note.version, notes: note.notes })}
            </li>
          ))}
        </ul>
      )}
      <button class="primary" onClick={onUpgrade} disabled={busy}>
        {busy ? t("libraryUpgradeNotice.updating") : t("libraryUpgradeNotice.update", { version: plan.toVersion })}
      </button>
      <ErrorMessage error={error} />
    </div>
  );
}
