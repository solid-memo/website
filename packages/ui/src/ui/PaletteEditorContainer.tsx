// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { PaletteDraft } from "@solid-memo/domain/customPalette";
import type { Instance } from "@solid-memo/domain/instance";
import { isSameUrl } from "@solid-memo/domain/instanceLayout";
import { ErrorMessage } from "./ErrorMessage";
import { Loading } from "./Loading";
import { PaletteEditorScreen } from "./PaletteEditorScreen";
import { routeToHash } from "./router";
import { useI18n } from "./i18n";
import { palettesKey, useTheme } from "./theme";

/**
 * Owns the editor of a palette of the user's own: reads the instance's
 * palettes, the one edited among them (a new one when it names none
 * there), and saves it. A palette saved is the one the app is shown in
 * from then on, on this device and in the instance's preferences, and
 * the editor goes back to the preferences.
 */
export function PaletteEditorContainer({
  useCases,
  instance,
  paletteUrl,
  onDone,
}: {
  useCases: UseCases;
  instance: Instance;
  paletteUrl?: string;
  onDone: () => void;
}) {
  const { t, errorText } = useI18n();
  const queryClient = useQueryClient();
  const { chooseCustomPalette } = useTheme();
  const palettesQuery = useQuery({
    queryKey: palettesKey(instance.url),
    queryFn: () => useCases.listPalettes(instance.url),
  });
  const saveMutation = useMutation({
    mutationFn: ({ draft, useAnyway }: { draft: PaletteDraft; useAnyway: boolean }) =>
      useCases.savePalette(instance.url, draft, { useAnyway }),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: palettesKey(instance.url) });
      chooseCustomPalette(saved);
      onDone();
    },
  });

  if (palettesQuery.error) return <ErrorMessage error={errorText(palettesQuery.error)} />;
  if (palettesQuery.data === undefined) return <Loading label={t("paletteEditor.loading")} />;
  const palette =
    paletteUrl === undefined
      ? undefined
      : palettesQuery.data.find((own) => isSameUrl(own.url, paletteUrl));
  return (
    <PaletteEditorScreen
      key={palette?.url ?? "new"}
      palette={palette}
      busy={saveMutation.isPending}
      error={errorText(saveMutation.error)}
      cancelHref={routeToHash({ screen: "preferences", instanceUrl: instance.url })}
      onSave={(draft, useAnyway) => saveMutation.mutate({ draft, useAnyway })}
    />
  );
}
