// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { RegistrationOptions, RegistrationTarget } from "@solid-memo/domain/instance";
import {
  isExposedPrivateIndex,
  isHiddenPublicIndex,
  rankedFor,
  type TypeIndexChoice,
  type TypeIndexKind,
} from "@solid-memo/domain/typeIndexChoice";
import { useId, useState } from "preact/hooks";
import { useI18n, type MessageKey } from "./i18n";

/** One choice of the chooser: a type index of the user's, a new one of a kind, or one they enter. */
interface Option {
  key: string;
  target: RegistrationTarget;
  label: MessageKey;
  /** The index's address, for telling several of a kind apart. */
  url?: string;
  recommended: boolean;
  /** Whether what public means is said of it. */
  isPublic: boolean;
  notes: MessageKey[];
  cautions: MessageKey[];
}

/**
 * Where an instance is registered (docs/data-model.md "Choosing a type
 * index"): each type index of the user's, ranked, the best private one
 * preselected as Recommended, with what is known of each: whether it
 * already holds Solid Memo's instances, a type that says it is the other
 * kind, a document linked as both kinds, a public one no one else can
 * read, a private one anyone can. A kind the user has none of is
 * offered as one to create, with the warn-and-choose flow when that is
 * the private one; and any other type index of theirs can be entered by
 * its address. A line says what a type index is, as few know the term,
 * and each public choice says what public means.
 */
export function RegistrationTargetChooser({
  options,
  value,
  onChange,
}: {
  /** null while the registration options are still loading. */
  options: RegistrationOptions | null;
  value: RegistrationTarget;
  onChange: (target: RegistrationTarget) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const introId = `${id}-intro`;
  const warningId = `${id}-warning`;
  const publicMeansId = `${id}-public`;
  const [otherUrl, setOtherUrl] = useState(
    typeof value === "string" || options?.indexes.some((i) => i.url === value.indexUrl)
      ? ""
      : value.indexUrl,
  );
  const warn = options !== null && !options.privateIndexExists;
  const choices = optionsOf(options);
  const checked = checkedKey(options, value);
  const otherChecked = checked === OTHER;
  return (
    // What a type index is, and the warning, describe the group, so they are heard on tabbing to a choice.
    <fieldset aria-describedby={warn ? `${introId} ${warningId}` : introId}>
      <legend>{t("registrationTargetChooser.legend")}</legend>
      <p id={introId} class="hint">
        {t("registrationTargetChooser.intro")}
      </p>
      {warn && (
        <p id={warningId} class="warning">
          {t("registrationTargetChooser.noPrivateIndex")}
        </p>
      )}
      {choices.map((choice) => {
        const notesId = `${id}-${choice.key}-notes`;
        const described = [
          ...(choice.notes.length + choice.cautions.length > 0 ? [notesId] : []),
          ...(choice.isPublic ? [publicMeansId] : []),
        ];
        return (
          <div key={choice.key}>
            <label class="radio-option">
              <input
                type="radio"
                name={`${id}-registration-target`}
                checked={checked === choice.key}
                aria-describedby={described.length > 0 ? described.join(" ") : undefined}
                onChange={() => onChange(choice.target)}
              />
              {t(choice.label)}
              {choice.recommended && ` (${t("registrationTargetChooser.recommended")})`}
              {choice.url !== undefined && <span class="hint">{choice.url}</span>}
            </label>
            {choice.notes.length + choice.cautions.length > 0 && (
              <div id={notesId} class="registration-target-notes">
                {choice.notes.map((note) => (
                  <p key={note} class="hint">
                    {t(note)}
                  </p>
                ))}
                {choice.cautions.map((caution) => (
                  <p key={caution} class="warning">
                    {t(caution)}
                  </p>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {options !== null && (
        <>
          <label class="radio-option">
            <input
              type="radio"
              name={`${id}-registration-target`}
              checked={otherChecked}
              onChange={() => onChange({ indexUrl: otherUrl.trim() })}
            />
            {t("registrationTargetChooser.another")}
          </label>
          {otherChecked && (
            <div class="registration-target-notes">
              <label for={`${id}-other-url`}>{t("registrationTargetChooser.anotherUrl")}</label>
              <input
                id={`${id}-other-url`}
                type="url"
                required
                aria-describedby={`${id}-other-hint`}
                value={otherUrl}
                onInput={(event) => {
                  setOtherUrl(event.currentTarget.value);
                  onChange({ indexUrl: event.currentTarget.value.trim() });
                }}
              />
              <p id={`${id}-other-hint`} class="hint">
                {t("registrationTargetChooser.anotherHint")}
              </p>
            </div>
          )}
        </>
      )}
      <p id={publicMeansId} class="hint">
        {t("registrationTargetChooser.publicMeans")}
      </p>
    </fieldset>
  );
}

/** The key of the choice entered by its address. */
const OTHER = "other";

/**
 * The choices: while the options load, the two kinds; then each index
 * of the user's, ranked (RegistrationOptions.indexes), and one to create
 * of each kind they have none of.
 */
function optionsOf(options: RegistrationOptions | null): Option[] {
  if (options === null) {
    return (["private", "public"] as const).map((kind) => ({
      key: kind,
      target: kind,
      label: `registrationTargetChooser.${kind}`,
      recommended: false,
      isPublic: kind === "public",
      notes: [],
      cautions: [],
    }));
  }
  const recommended = rankedFor(options.indexes, "private")[0];
  const created = (kind: TypeIndexKind): Option => ({
    key: kind,
    target: kind,
    label: `registrationTargetChooser.${kind}Created`,
    recommended: kind === "private",
    isPublic: kind === "public",
    notes: [],
    cautions: [],
  });
  return [
    ...options.indexes.map((index) => indexOption(index, index === recommended)),
    ...(options.privateIndexExists ? [] : [created("private")]),
    ...(options.publicIndexExists ? [] : [created("public")]),
  ];
}

function indexOption(index: TypeIndexChoice, recommended: boolean): Option {
  const both = index.kinds.length > 1;
  const [kind] = index.kinds;
  const cautions: MessageKey[] = [];
  if (both) cautions.push("registrationTargetChooser.linkedAsBoth");
  if (index.typeFit === "other") {
    cautions.push(
      kind === "private"
        ? "registrationTargetChooser.typedPublic"
        : "registrationTargetChooser.typedPrivate",
    );
  }
  if (isHiddenPublicIndex(index)) cautions.push("registrationTargetChooser.hiddenPublic");
  if (isExposedPrivateIndex(index)) cautions.push("registrationTargetChooser.exposedPrivate");
  return {
    key: index.url,
    target: { indexUrl: index.url },
    label: both ? "registrationTargetChooser.both" : `registrationTargetChooser.${kind}`,
    url: index.url,
    recommended,
    isPublic: index.kinds.includes("public"),
    notes: index.holdsInstances ? ["registrationTargetChooser.holdsInstances"] : [],
    cautions,
  };
}

/**
 * Which choice `value` is: of a kind, the best index of that kind
 * (rankedFor), as the instance would be registered in, or the one to
 * create; by its address, that index, or else the one entered.
 */
function checkedKey(options: RegistrationOptions | null, value: RegistrationTarget): string {
  if (typeof value === "string") {
    return (options === null ? undefined : rankedFor(options.indexes, value)[0]?.url) ?? value;
  }
  return options?.indexes.some((index) => index.url === value.indexUrl) ? value.indexUrl : OTHER;
}
