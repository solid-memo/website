import type { ComponentChildren } from "preact";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n } from "./i18n";
import { usePanelFocus } from "./panelFocus";

/**
 * The partial copy that moving the guest's study into the user's Pod
 * left when a closed tab cut it off (docs/guest-mode.md "As a new
 * instance"), shown on the guest's instance with the button that removes
 * it. Renders nothing when this browser noted no such move of the
 * instance. Once removed, the panel goes and the focus moves to the
 * screen; while it works, the button keeps the focus (aria-disabled).
 */
export function InterruptedMoveContainer({ useCases, instance }: { useCases: UseCases; instance: Instance }) {
  const { t, errorText } = useI18n();
  const queryClient = useQueryClient();

  const leftoverQuery = useQuery({
    queryKey: ["interruptedMove", instance.url],
    queryFn: () => useCases.findInterruptedGuestMove(instance),
    staleTime: Infinity,
  });

  const removeMutation = useMutation({
    mutationFn: () => useCases.removeInterruptedGuestMove(instance),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["interruptedMove", instance.url] });
    },
  });

  const leftover = leftoverQuery.data ?? null;
  if (leftover === null) return null;
  return (
    <LeftoverPanel
      message={t("interruptedMove.text", { name: instance.name, url: leftover })}
      busy={removeMutation.isPending}
      onRemove={() => removeMutation.mutate()}
    >
      <ErrorMessage error={errorText(removeMutation.error)} />
    </LeftoverPanel>
  );
}

/** The panel itself: there when the screen loads, so it takes no focus, but gives it back when it goes. */
function LeftoverPanel({
  message,
  busy,
  onRemove,
  children,
}: {
  message: string;
  busy: boolean;
  onRemove: () => void;
  /** The removal's error, if any. */
  children: ComponentChildren;
}) {
  const { t } = useI18n();
  const ref = usePanelFocus<HTMLDivElement>(false);
  return (
    <div ref={ref} class="warning migration" role="region" aria-label={t("interruptedMove.region")} tabIndex={-1}>
      <p>{message}</p>
      <button
        onClick={() => {
          if (!busy) onRemove();
        }}
        aria-disabled={busy}
      >
        {busy ? t("interruptedMove.removing") : t("interruptedMove.remove")}
      </button>
      {children}
    </div>
  );
}
