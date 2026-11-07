// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useState } from "preact/hooks";
import { isMarkdown } from "@solid-memo/domain/deck";
import { isHttpUrl } from "@solid-memo/domain/webId";
import type { LangText } from "@solid-memo/domain/langText";
import { DataLineContent, DataText, plainDataText } from "./DataText";
import { useCardText } from "./cardLanguage";
import { ShowPictures, usePictureAccess, usePictureGate } from "./deckPictures";
import { useI18n } from "./i18n";
import { CardText } from "./ReaderText";
import { ZoomableImage } from "./ZoomableImage";

/**
 * One side of a card as it looks in study: its picture (if any) above its
 * text (if any), with the side's label above its text and its note
 * under it, both smaller. A question's note is passed only once the
 * answer is revealed. A picture URL comes from pod data, so only http(s) URLs
 * are loaded; anything else is named rather than shown. A picture is never
 * marked decorative, even beside text: the text need not describe it (a
 * flag under "Which country?"), so its alt is the description the card
 * gives it, in the reader's language (the deck's card language first, useCardText), else a name for its side. A tap
 * enlarges the picture to the viewport's size and another puts it back
 * (ZoomableImage). On a deck that asks about its pictures' hosts
 * (DeckPictures), a picture not chosen yet is requested from nowhere:
 * its name and the choice stand in its place (CardPicture).
 *
 * The face is sized by its role — the question large, the answer under
 * it smaller — not by which side it is, so a deck studied back-to-front
 * looks like any other. Without a role, the front asks and the back
 * answers. A question's text shrinks a little as it grows longer, so a
 * phrase is not set as large as a word; its length is passed to the
 * stylesheet as `--text-length`, in characters.
 *
 * Size and place say which face is which only to the eye, so each face
 * also starts with a hidden name for screen readers: "Question" and
 * "Answer" in study, where a role is given, "Front" and "Back" elsewhere.
 *
 * A card in Markdown (`textFormat`) shows its text and note as Markdown
 * and its label as one line of it (DataText); its pictures'
 * descriptions are always plain.
 */
export function CardFace({
  side,
  role: givenRole,
  text,
  imageUrl,
  imageDescription,
  label,
  note,
  textFormat,
}: {
  side: "front" | "back";
  role?: "question" | "answer";
  /** The side's text in every language it is in, shown in the reader's. */
  text: LangText;
  imageUrl?: string;
  /** What the picture shows, its alt text, in the reader's language. */
  imageDescription?: LangText;
  /** What kind of thing the side is, e.g. "Country", or on the back how it relates to the front, e.g. "Replaced by", in the reader's language. */
  label?: LangText;
  /** What holds of this side, e.g. "Out of use", in the reader's language. */
  note?: LangText;
  /** How the card's texts are written (`sm:textFormat`); absent is plain text. */
  textFormat?: string;
}) {
  const { t } = useI18n();
  const { cardText, cardLang } = useCardText();
  const markdown = isMarkdown(textFormat);
  const role = givenRole ?? (side === "front" ? "question" : "answer");
  const shownText = cardText(text);
  const textLength = [...plainDataText(shownText, markdown)].length;
  const description = imageDescription === undefined ? "" : cardText(imageDescription);
  const name =
    givenRole === undefined
      ? side === "front"
        ? t("cardFace.front")
        : t("cardFace.back")
      : role === "question"
        ? t("cardFace.question")
        : t("cardFace.answer");
  return (
    <div class={`card-face card-${side} card-${role}`} style={`--text-length: ${textLength}`}>
      <span class="visually-hidden">{`${name}: `}</span>
      {imageUrl !== undefined &&
        (isHttpUrl(imageUrl) ? (
          <CardPicture
            src={imageUrl}
            alt={
              description !== ""
                ? description
                : side === "front"
                  ? t("cardFace.frontPictureAlt")
                  : t("cardFace.backPictureAlt")
            }
            lang={description !== "" ? cardLang(imageDescription!) : undefined}
          />
        ) : (
          <p class="hint">{t("cardFace.notWebUrl")}</p>
        ))}
      {label !== undefined && (
        <p class="card-label" lang={cardLang(label)}>
          <DataLineContent text={label} markdown={markdown} />
        </p>
      )}
      {shownText !== "" && <DataText text={text} markdown={markdown} breaks />}
      {note !== undefined && <DataText class="card-note" text={note} markdown={markdown} breaks />}
    </div>
  );
}

/**
 * A side's picture, unless the deck asks about its host (DeckPictures)
 * and the learner has not chosen: then its name, what showing it means,
 * and the choice, with no request made. The picture's button takes the
 * focus from the choice's, which goes as the picture comes. While the
 * library's index is read, nothing yet.
 */
function CardPicture({ src, alt, lang }: { src: string; alt: string; lang: string | undefined }) {
  const { t } = useI18n();
  const gate = usePictureGate();
  const access = usePictureAccess(src);
  const [asked, setAsked] = useState(false);
  if (access === "wait") return null;
  if (access === "show") {
    return <ZoomableImage class="card-image" src={src} alt={alt} lang={lang} takeFocus={asked} />;
  }
  return (
    <div class="card-picture-hidden">
      <p lang={lang}>{alt}</p>
      <p class="hint">{t("cardFace.pictureHidden", { host: access.host })}</p>
      <ShowPictures gate={gate!} host={access.host} asked={asked} onAsk={() => setAsked(true)} />
    </div>
  );
}

/**
 * A card's picture at list size, e.g. beside its text in a Browser row.
 * Decorative by default, since the row's text sits next to it; give `alt`
 * (and its `lang`, when it is not the page's) when the picture is all
 * there is to name the row's link. On a deck that asks about its
 * pictures' hosts (DeckPictures), one not chosen is an empty frame of the
 * same name, with the choice above the list (HiddenPicturesNotice).
 */
export function CardThumbnail({
  imageUrl,
  alt = "",
  lang,
}: {
  imageUrl?: string;
  alt?: string;
  lang?: string;
}) {
  if (imageUrl === undefined || !isHttpUrl(imageUrl)) return null;
  return <Thumbnail url={imageUrl} alt={alt} lang={lang} />;
}

function Thumbnail({ url, alt, lang }: { url: string; alt: string; lang: string | undefined }) {
  if (usePictureAccess(url) === "show") {
    return (
      <img class="card-thumbnail" src={url} alt={alt} lang={lang} referrerpolicy="no-referrer" />
    );
  }
  return alt === "" ? (
    <span class="card-thumbnail card-thumbnail-hidden" aria-hidden="true" />
  ) : (
    <span class="card-thumbnail card-thumbnail-hidden" role="img" aria-label={alt} lang={lang} />
  );
}

/**
 * A Browser row's front: its picture and text, the row's one link for
 * screen readers (the back cell's link is hidden from them). A
 * picture-only front, such as a flag, would leave that link unnamed, so
 * its picture is named by its description, else after the back. Browsing
 * is not a test, and the back is on screen beside it anyway.
 */
export function CardRowFront({
  front,
  back,
  imageUrl,
  imageDescription,
  textFormat,
}: {
  front: LangText;
  back: LangText;
  imageUrl?: string;
  /** What the picture shows, when the card says. */
  imageDescription?: LangText;
  /** How the card's texts are written (`sm:textFormat`); absent is plain text. */
  textFormat?: string;
}) {
  const { t } = useI18n();
  const { cardText, cardLang } = useCardText();
  const markdown = isMarkdown(textFormat);
  // A Markdown front that shows no text (a rule alone) leaves the picture to name the row.
  const frontText = plainDataText(cardText(front), markdown);
  const backText = plainDataText(cardText(back), markdown);
  const description = imageDescription === undefined ? "" : cardText(imageDescription);
  const alt =
    frontText !== ""
      ? ""
      : description !== ""
        ? description
        : backText !== ""
          ? t("cardFace.pictureFor", { back: backText })
          : t("cardFace.frontPictureAlt");
  const lang = frontText === "" && description !== "" ? cardLang(imageDescription!) : undefined;
  return (
    <>
      <CardThumbnail imageUrl={imageUrl} alt={alt} lang={lang} />
      <RowText text={front} markdown={markdown} />
    </>
  );
}

/**
 * A Browser row's back: its picture and text, outside the row's link and
 * read in table order. A picture-only back would otherwise read as blank,
 * so its picture is named by its description, else by its side; beside
 * text it stays decorative, as on the front.
 */
export function CardRowBack({
  back,
  imageUrl,
  imageDescription,
  textFormat,
}: {
  back: LangText;
  imageUrl?: string;
  /** What the picture shows, when the card says. */
  imageDescription?: LangText;
  /** How the card's texts are written (`sm:textFormat`); absent is plain text. */
  textFormat?: string;
}) {
  const { t } = useI18n();
  const { cardText, cardLang } = useCardText();
  const backText = cardText(back);
  const description = imageDescription === undefined ? "" : cardText(imageDescription);
  const alt =
    backText !== "" ? "" : description !== "" ? description : t("cardFace.backPictureAlt");
  const lang = backText === "" && description !== "" ? cardLang(imageDescription!) : undefined;
  return (
    <>
      <CardThumbnail imageUrl={imageUrl} alt={alt} lang={lang} />
      <RowText text={back} markdown={isMarkdown(textFormat)} />
    </>
  );
}

/** How long a Markdown text shown in a Browser row may be. */
export const ROW_TEXT_MAX = 120;

/**
 * A side's text in a Browser row, inside the row's link: as written, or
 * for a card in Markdown its label (labelText), cut to ROW_TEXT_MAX
 * characters, for a row holds neither blocks nor links.
 */
function RowText({ text, markdown }: { text: LangText; markdown: boolean }) {
  const { cardText, cardLang } = useCardText();
  if (!markdown) return <CardText text={text} breaks />;
  const shown = plainDataText(cardText(text), true, ROW_TEXT_MAX);
  const lang = cardLang(text);
  return lang === undefined ? <>{shown}</> : <span lang={lang}>{shown}</span>;
}
