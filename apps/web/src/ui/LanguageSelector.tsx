import { LOCALES, type Locale } from "@solid-memo/domain/locale";
import { useI18n } from "./i18n";

/** Each language named in itself, so it is found whichever is spoken now. */
export const LANGUAGE_NAMES: Record<Locale, string> = { en: "English", sv: "Svenska", ko: "한국어" };

/** Each language's flag, from where the world flags deck takes its flags. */
const FLAGS: Record<Locale, string> = {
  en: "https://flagcdn.com/gb.svg",
  sv: "https://flagcdn.com/se.svg",
  ko: "https://flagcdn.com/kr.svg",
};

/** The languages the app speaks, as flags; the one spoken now is pressed. */
export function LanguageSelector() {
  const { locale, chooseLocale, t } = useI18n();
  return (
    <div class="language-selector" role="group" aria-label={t("language.label")}>
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          title={LANGUAGE_NAMES[option]}
          aria-pressed={option === locale}
          onClick={() => chooseLocale(option)}
        >
          <img src={FLAGS[option]} alt={LANGUAGE_NAMES[option]} width={24} height={16} />
        </button>
      ))}
    </div>
  );
}
