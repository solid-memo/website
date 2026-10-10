import type { DraftChange, DraftKind, DraftRefusal } from "@solid-memo/domain/release/releaseDraft";
import { useI18n } from "@solid-memo/ui/i18n";

/**
 * Retire or restore a chapter, step or card of a draft, or delete it,
 * once the user confirms. One a release before the draft published
 * (`published`) is never deleted: a learner's progress may name it, so
 * its Delete is held, and a line says to retire it instead.
 */
export function LifeActions({
  of,
  id,
  name,
  retired,
  published,
  onEdit,
  onDeleted,
}: {
  of: Exclude<DraftKind, "distractor">;
  id: string;
  /** How the confirmation names it. */
  name: string;
  retired: boolean;
  published: boolean;
  onEdit: (change: DraftChange) => DraftRefusal | null;
  /** The subject is deleted: its screen goes. */
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="draft-life-heading" class="draft-life">
      <h3 id="draft-life-heading">{t(`studio.draftEdit.life.${of}`)}</h3>
      {published && <p class="hint">{t("studio.draftEdit.published")}</p>}
      <p class="actions">
        <button type="button" onClick={() => onEdit({ kind: retired ? "restore" : "retire", of, id })}>
          {t(retired ? "studio.draftEdit.restore" : "studio.draftEdit.retire")}
        </button>
        <button
          type="button"
          class="danger"
          disabled={published}
          onClick={() => {
            if (window.confirm(t(`studio.draftEdit.deleteConfirm.${of}`, { name })) && onEdit({ kind: "delete", of, id }) === null) onDeleted();
          }}
        >
          {t("studio.draftEdit.delete")}
        </button>
      </p>
    </section>
  );
}
