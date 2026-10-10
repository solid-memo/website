import { useI18n } from "@solid-memo/ui/i18n";

/** How many problems, as a pill (`.studio-count`): the number shown, "3 problems" heard. */
export function ProblemCount({ count }: { count: number }) {
  const { t } = useI18n();
  return (
    <span class="studio-count">
      <span aria-hidden="true">{count}</span>
      <span class="visually-hidden">{t("studio.shell.problems", { count })}</span>
    </span>
  );
}
