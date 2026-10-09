import { useI18n } from "./i18n";
import { MoonIcon, SunIcon } from "./icons";
import { useTheme } from "./theme";

/**
 * Toggles between the light and the dark theme: a sun in the light one, a
 * moon in the dark one, named for the theme a press switches to.
 */
export function ThemeToggle() {
  const { t } = useI18n();
  const { theme, chooseTheme } = useTheme();
  const dark = theme === "dark";
  const label = dark ? t("theme.toLight") : t("theme.toDark");
  return (
    <button
      type="button"
      class="theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => chooseTheme(dark ? "light" : "dark")}
    >
      {dark ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
