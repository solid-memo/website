import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import type { StudyPreferences } from "@solid-memo/domain/preferences";
import { ErrorMessage } from "./ErrorMessage";
import { Loading } from "./Loading";
import { PreferencesScreen } from "./PreferencesScreen";
import { useI18n } from "./i18n";
import { instanceThemeKey } from "./theme";

/** Owns the preferences query/mutation for one instance. */
export function PreferencesContainer({
  useCases,
  instance,
  onBack,
}: {
  useCases: UseCases;
  instance: Instance;
  onBack: () => void;
}) {
  const { t, errorText } = useI18n();
  const queryClient = useQueryClient();

  const preferencesQuery = useQuery({
    queryKey: ["preferences", instance.url],
    queryFn: () => useCases.getPreferences(instance.url),
  });

  const saveMutation = useMutation({
    mutationFn: (preferences: StudyPreferences) =>
      useCases.savePreferences(instance.url, preferences),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["preferences", instance.url],
      });
      // The first save puts the theme into the instance's preferences.
      await queryClient.invalidateQueries({ queryKey: instanceThemeKey(instance.url) });
      queryClient.removeQueries({ queryKey: ["studyQueue"] });
      onBack();
    },
  });

  if (preferencesQuery.error) {
    return <ErrorMessage error={errorText(preferencesQuery.error)} />;
  }
  if (preferencesQuery.data === undefined) {
    return <Loading label={t("preferences.loading")} />;
  }

  return (
    <PreferencesScreen
      preferences={preferencesQuery.data}
      busy={saveMutation.isPending}
      error={errorText(saveMutation.error)}
      onSave={(preferences) => saveMutation.mutate(preferences)}
    />
  );
}
