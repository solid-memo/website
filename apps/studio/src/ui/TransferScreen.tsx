import { useState } from "preact/hooks";
import type { Deck } from "@solid-memo/domain/deck";
import { DECK_FILE_FORMATS, hasProgress, type DeckFile, type DeckFileFormat, type DeckFileOptions } from "@solid-memo/domain/deckFile";
import type { Instance } from "@solid-memo/domain/instance";
import type { ReadOnlyReason } from "@solid-memo/ui/dataCheck";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n, type ErrorText } from "@solid-memo/ui/i18n";
import { ReaderText } from "@solid-memo/ui/ReaderText";
import { ReadOnlyScope } from "./ReadOnly";

/** How far an export of several decks is. */
export interface ExportRun {
  deck: Deck;
  /** Which of the decks it is, from 0. */
  index: number;
  total: number;
}

/**
 * Decks to and from files (docs/studio.md#import-and-export). Export:
 * the instance's decks, the ones `chosen` ticked (the URL holds them),
 * saved each as a file of its own, in the format picked, with the
 * user's progress when asked. Import: a file the user picks, what it
 * holds (its deck, its cards, any progress, and what of it was brought
 * up to date or left out), then a new deck of the instance made of it,
 * with its progress when asked. An import adds to the catalogue, so it
 * is held while the catalogue may not be changed (`importReadOnly`); a
 * file can still be read, and every deck exported.
 */
export function TransferScreen({
  instance,
  decks,
  chosen,
  onChoose,
  exporting,
  exported,
  exportError,
  onExport,
  file,
  opening,
  openError,
  onOpen,
  importing,
  imported,
  importError,
  onImport,
  importReadOnly,
  healthHref,
  cardsHref,
}: {
  instance: Instance;
  /** The instance's decks, in the order the user arranged them. */
  decks: readonly Deck[];
  /** The URLs of the decks ticked to export. */
  chosen: readonly string[];
  onChoose: (urls: readonly string[]) => void;
  /** The deck being exported; null when none is. */
  exporting: ExportRun | null;
  /** How many decks the last export saved; null before one ends. */
  exported: number | null;
  exportError: ErrorText | null;
  onExport: (decks: readonly Deck[], options: DeckFileOptions) => void;
  /** The file picked, read; null before one is. */
  file: DeckFile | null;
  opening: boolean;
  openError: ErrorText | null;
  onOpen: () => void;
  importing: boolean;
  /** The deck the last import made; null before one does. */
  imported: Deck | null;
  importError: ErrorText | null;
  onImport: (withProgress: boolean) => void;
  /** Why no deck can be imported now (useDataCheck); null when one can. */
  importReadOnly: ReadOnlyReason | null;
  /** The instance's health, where data set aside is repaired. */
  healthHref: string;
  /** A deck's cards, in the workbench. */
  cardsHref: (deck: Deck) => string;
}) {
  const { t, tx, readerText } = useI18n();
  const [format, setFormat] = useState<DeckFileFormat>("turtle");
  const [withProgress, setWithProgress] = useState(false);
  const [importProgress, setImportProgress] = useState(true);

  const selected = decks.filter((deck) => chosen.includes(deck.url));
  const toggle = (url: string, on: boolean) => onChoose(on ? [...chosen, url] : chosen.filter((each) => each !== url));

  return (
    <section>
      <header>
        <h2>{t("studio.transfer.heading", { instance: instance.name })}</h2>
      </header>

      <section aria-labelledby="transfer-export-heading">
        <h3 id="transfer-export-heading">{t("studio.transfer.export")}</h3>
        <p class="hint">{t("studio.transfer.exportIntro")}</p>
        {decks.length === 0 ? (
          <p>{t("studio.transfer.noDecks")}</p>
        ) : (
          <form
            class="card-edit"
            onSubmit={(event) => {
              event.preventDefault();
              onExport(selected, { format, withProgress });
            }}
          >
            <fieldset>
              <legend>{t("studio.transfer.decks")}</legend>
              {decks.map((deck) => (
                <label key={deck.url}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(deck.url)}
                    disabled={exporting !== null}
                    onChange={(event) => toggle(deck.url, event.currentTarget.checked)}
                  />
                  <ReaderText text={deck.title} />
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>{t("studio.transfer.format")}</legend>
              {DECK_FILE_FORMATS.map((option) => (
                <label key={option} class="radio-option">
                  <input
                    type="radio"
                    name="transfer-format"
                    value={option}
                    checked={format === option}
                    onChange={() => setFormat(option)}
                  />
                  {t(`studio.transfer.formats.${option}`)}
                </label>
              ))}
            </fieldset>
            <label>
              <input type="checkbox" checked={withProgress} onChange={(event) => setWithProgress(event.currentTarget.checked)} />
              {t("studio.transfer.withProgress")}
            </label>
            <button type="submit" class="primary" disabled={selected.length === 0 || exporting !== null}>
              {t("studio.transfer.exportButton", { count: selected.length })}
            </button>
          </form>
        )}
        <p role="status">
          {exporting !== null
            ? tx("studio.transfer.exporting", {
                deck: <ReaderText text={exporting.deck.title} />,
                at: exporting.index + 1,
                total: exporting.total,
              })
            : exported !== null
              ? t("studio.transfer.exported", { count: exported })
              : ""}
        </p>
        <ErrorMessage error={exportError} />
      </section>

      <section aria-labelledby="transfer-import-heading">
        <h3 id="transfer-import-heading">{t("studio.transfer.import")}</h3>
        <p class="hint">{t("studio.transfer.importIntro", { instance: instance.name })}</p>
        <p>
          <button type="button" disabled={opening || importing} onClick={onOpen}>
            {t("studio.transfer.choose")}
          </button>
        </p>
        <ErrorMessage error={openError} />
        {opening && <p role="status">{t("studio.transfer.reading")}</p>}
        <ReadOnlyScope reason={importReadOnly} subject="catalogue" healthHref={healthHref}>
          {file !== null && (
            <form
              class="card-edit"
              aria-labelledby="transfer-file-heading"
              onSubmit={(event) => {
                event.preventDefault();
                onImport(hasProgress(file.content) && importProgress);
              }}
            >
              <h4 id="transfer-file-heading">
                {tx("studio.transfer.file", { name: file.name, deck: <ReaderText text={file.content.deck.title} /> })}
              </h4>
              <ul>
                <li>{t("studio.transfer.cards", { count: file.content.cards.length })}</li>
                {file.content.reviews !== undefined && <li>{t("studio.transfer.states", { count: file.content.reviews.length })}</li>}
                {file.content.deck.completedChapters !== undefined && (
                  <li>{t("studio.transfer.chapters", { count: file.content.deck.completedChapters.length })}</li>
                )}
                {file.content.upgraded.length > 0 && <li>{t("studio.transfer.upgraded", { count: file.content.upgraded.length })}</li>}
                {file.content.dropped.length > 0 && <li>{t("studio.transfer.dropped", { count: file.content.dropped.length })}</li>}
              </ul>
              {hasProgress(file.content) && (
                <label>
                  <input type="checkbox" checked={importProgress} onChange={(event) => setImportProgress(event.currentTarget.checked)} />
                  {t("studio.transfer.importProgress")}
                </label>
              )}
              <button type="submit" class="primary" disabled={importing}>
                {t("studio.transfer.importButton", { instance: instance.name })}
              </button>
            </form>
          )}
        </ReadOnlyScope>
        <p role="status">
          {importing
            ? t("studio.transfer.importing")
            : imported !== null &&
              tx("studio.transfer.imported", {
                deck: <a href={cardsHref(imported)}>{readerText(imported.title)}</a>,
              })}
        </p>
        <ErrorMessage error={importError} />
      </section>
    </section>
  );
}
