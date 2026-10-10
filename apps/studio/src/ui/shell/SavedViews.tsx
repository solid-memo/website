import { Fragment } from "preact";
import { useState } from "preact/hooks";
import { ActionsMenu, MenuItem } from "@solid-memo/ui/ActionsMenu";
import { useI18n } from "@solid-memo/ui/i18n";
import { useConfirm } from "./ConfirmDialog";
import { Dialog } from "./Dialog";
import { renamedView, withoutView, withSavedView, type SavedView } from "./views";

/**
 * The views a table's user saved (views.ts), beside its own, in their
 * group of tabs: each a button that puts the table in its query
 * (`onApply`), pressed while the table is in it (`current`, its query's
 * parameters), with a menu to rename it or remove it (once the user
 * confirms); then **Save view**, which saves the table's query under a
 * name, asked in a dialog. A name is a view's own: saving or renaming
 * under a name taken replaces that view. What changes is the screen's
 * to keep (`onViews`).
 */
export function SavedViews({
  views,
  current,
  onApply,
  onViews,
}: {
  views: readonly SavedView[];
  /** The table's query, as a saved view keeps it. */
  current: string;
  onApply: (params: string) => void;
  onViews: (views: SavedView[]) => void;
}) {
  const { t } = useI18n();
  const [menu, setMenu] = useState<string | null>(null);
  // The view renamed, or null for one saved; undefined while no name is asked for.
  const [naming, setNaming] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState("");
  const { ask, dialog } = useConfirm();

  function nameIt(from: string | null) {
    setName(from ?? "");
    setNaming(from);
  }

  return (
    <>
      {views.map((view) => (
        <Fragment key={view.name}>
          <button type="button" class="studio-saved-view" aria-pressed={view.params === current} onClick={() => onApply(view.params)}>
            {view.name}
          </button>
          <ActionsMenu
            label={t("studio.views.options", { name: view.name })}
            buttonClass="studio-view-menu"
            open={menu === view.name}
            onOpen={() => setMenu(view.name)}
            onClose={() => setMenu(null)}
          >
            <MenuItem onSelect={() => nameIt(view.name)}>{t("studio.views.rename")}</MenuItem>
            <MenuItem
              onSelect={() =>
                ask({
                  heading: t("studio.views.removeHeading"),
                  text: t("studio.views.removeConfirm", { name: view.name }),
                  action: t("studio.views.remove"),
                  onConfirm: () => onViews(withoutView(views, view.name)),
                })
              }
            >
              {t("studio.views.remove")}
            </MenuItem>
          </ActionsMenu>
        </Fragment>
      ))}
      <button type="button" onClick={() => nameIt(null)}>
        {t("studio.views.save")}
      </button>
      {dialog}
      {naming !== undefined && (
        <Dialog heading={naming === null ? t("studio.views.saveHeading") : t("studio.views.renameHeading", { name: naming })} onClose={() => setNaming(undefined)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim() === "") return;
              onViews(naming === null ? withSavedView(views, name, current) : renamedView(views, naming, name));
              setNaming(undefined);
            }}
          >
            <label>
              {t("studio.views.name")}
              <input type="text" required autoFocus value={name} onInput={(event) => setName(event.currentTarget.value)} />
            </label>
            <p class="hint">{t("studio.views.nameHint")}</p>
            <p class="actions">
              <button type="submit" class="primary">
                {t("studio.views.saveButton")}
              </button>
              <button type="button" onClick={() => setNaming(undefined)}>
                {t("studio.bulk.cancel")}
              </button>
            </p>
          </form>
        </Dialog>
      )}
    </>
  );
}
