import type {
  RegistrationOptions,
  RegistrationTarget,
} from "@solid-memo/domain/instance";
import { useId } from "preact/hooks";
import { useI18n } from "./i18n";

/**
 * Choice between the private and public type index, with the
 * warn-and-choose flow when the private index does not exist yet. A line
 * says what a type index is, as few know the term.
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
  const introId = useId();
  const warn = options !== null && !options.privateIndexExists;
  // What a type index is, and the warning, describe the group, so they are heard on tabbing to a choice.
  return (
    <fieldset aria-describedby={warn ? `${introId} registration-target-warning` : introId}>
      <legend>{t("registrationTargetChooser.legend")}</legend>
      <p id={introId} class="hint">
        {t("registrationTargetChooser.intro")}
      </p>
      {warn && (
        <p id="registration-target-warning" class="warning">
          {t("registrationTargetChooser.noPrivateIndex")}
        </p>
      )}
      <label>
        <input
          type="radio"
          name="registration-target"
          checked={value === "private"}
          onChange={() => onChange("private")}
        />
        {warn
          ? t("registrationTargetChooser.privateCreated")
          : t("registrationTargetChooser.private")}
      </label>
      <label>
        <input
          type="radio"
          name="registration-target"
          checked={value === "public"}
          onChange={() => onChange("public")}
        />
        {options !== null && !options.publicIndexExists
          ? t("registrationTargetChooser.publicCreated")
          : t("registrationTargetChooser.public")}
      </label>
    </fieldset>
  );
}
