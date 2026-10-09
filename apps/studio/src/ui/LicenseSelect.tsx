import { KNOWN_LICENSES, licenseLabel } from "@solid-memo/domain/license";
import { useI18n } from "@solid-memo/ui/i18n";

/**
 * A licence to choose (dcterms:license): none, one of KNOWN_LICENSES,
 * or the one there is (`current`), which another app may have written:
 * it is offered as it is, so keeping it is a choice too. Each is named
 * by licenseLabel; "" is none.
 */
export function LicenseSelect({
  id,
  value,
  current,
  disabled,
  onChange,
}: {
  id: string;
  /** The licence chosen; "" for none. */
  value: string;
  current: string | undefined;
  disabled: boolean;
  onChange: (license: string) => void;
}) {
  const { t } = useI18n();
  const offered = current === undefined || KNOWN_LICENSES.includes(current) ? KNOWN_LICENSES : [...KNOWN_LICENSES, current];
  return (
    <>
      <label for={id}>{t("studio.license.label")}</label>
      <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)}>
        <option value="">{t("studio.license.none")}</option>
        {offered.map((url) => (
          <option key={url} value={url}>
            {licenseLabel(url)}
          </option>
        ))}
      </select>
    </>
  );
}
