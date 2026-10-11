import { Fragment } from "preact";
import { useI18n } from "@solid-memo/ui/i18n";
import { Dialog } from "./Dialog";
import { SHORTCUTS, type ShortcutId, type ShortcutScope } from "./shortcuts";

const SCOPES: readonly ShortcutScope[] = ["studio", "table"];

/** What a shortcut does, as the key help says it: the nine tabs' keys as one. */
const aboutOf = (id: ShortcutId) =>
  id.startsWith("tab.") ? "tab" : (id as Exclude<ShortcutId, `tab.${number}`>);

/**
 * Every shortcut of the Studio, by where it works, in a dialog (`?`),
 * and whether a character alone is one (`characterKeys`): the user may
 * turn those off (`onCharacterKeys`), as speech input may type them.
 */
export function KeyHelp({
  characterKeys,
  onCharacterKeys,
  onClose,
}: {
  characterKeys: boolean;
  onCharacterKeys: (on: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog heading={t("studio.keys.heading")} onClose={onClose}>
      <p class="hint">{t("studio.keys.chords")}</p>
      <label class="studio-character-keys">
        <input
          type="checkbox"
          checked={characterKeys}
          onChange={(event) => onCharacterKeys(event.currentTarget.checked)}
        />
        {t("studio.keys.characterKeys")}
      </label>
      <p class="hint">{t("studio.keys.characterKeysHint")}</p>
      {SCOPES.map((scope) => (
        <section key={scope}>
          <h3>{t(`studio.keys.scope.${scope}`)}</h3>
          <dl class="studio-keymap">
            {SHORTCUTS.filter((shortcut) => shortcut.scope === scope && shortcut.help !== null).map(
              (shortcut) => (
                <Fragment key={shortcut.id}>
                  <dt>
                    <Keys keys={shortcut.help ?? shortcut.keys} />
                  </dt>
                  <dd>{t(`studio.keys.${aboutOf(shortcut.id)}`)}</dd>
                </Fragment>
              ),
            )}
          </dl>
        </section>
      ))}
    </Dialog>
  );
}

/** A shortcut's keys, each its own `kbd`: a chord's one after the other, a modifier's joined with "+". */
export function Keys({ keys }: { keys: string }) {
  return (
    <>
      {keys.split(" ").map((press, at) => (
        <Fragment key={at}>
          {at > 0 && " "}
          {press.split("+").map((key, plus) => (
            <Fragment key={plus}>
              {plus > 0 && "+"}
              <kbd>{key}</kbd>
            </Fragment>
          ))}
        </Fragment>
      ))}
    </>
  );
}
