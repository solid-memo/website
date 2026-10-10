import type { ComponentChildren } from "preact";
import { useId, useState } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import {
  GUEST_MERGE_STEPS,
  GUEST_TRANSFER_STEPS,
  suggestedGuestLocation,
  type GuestMergeOutcome,
  type GuestMergeProgress,
  type GuestMergeStep,
  type GuestTransferOutcome,
  type GuestTransferProgress,
  type GuestTransferStep,
} from "@solid-memo/domain/guest";
import type { Instance, RegistrationTarget } from "@solid-memo/domain/instance";
import type { Session } from "@solid-memo/domain/session";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type I18n, type ErrorText } from "./i18n";
import { usePanelFocus } from "./panelFocus";
import { RegistrationTargetChooser } from "./RegistrationTargetChooser";
import { routeToHash } from "./router";
import { StepProgress } from "./StepProgress";

/** What each step of the move into a new instance does, as the progress line names it. */
function stepLabels(t: I18n["t"]): Record<GuestTransferStep, string> {
  return {
    stage: t("guestOffer.step.stage"),
    copy: t("guestOffer.step.copy"),
    adopt: t("guestOffer.step.adopt"),
    validate: t("guestOffer.step.validate"),
    verify: t("guestOffer.step.verify"),
    register: t("guestOffer.step.register"),
    tidy: t("guestOffer.step.tidy"),
  };
}

/** What each step of adding the study to an instance does, as the progress line names it. */
function mergeStepLabels(t: I18n["t"]): Record<GuestMergeStep, string> {
  return {
    read: t("guestOffer.mergeStep.read"),
    decks: t("guestOffer.mergeStep.decks"),
    arrange: t("guestOffer.mergeStep.arrange"),
    verify: t("guestOffer.mergeStep.verify"),
    tidy: t("guestOffer.mergeStep.tidy"),
  };
}

type Stage = "offer" | "discard" | "form" | "dismissed";

/** How keeping the study ended: moved into a new instance, or added to one the user has. */
type KeepOutcome = { kind: "transfer"; outcome: GuestTransferOutcome } | { kind: "merge"; outcome: GuestMergeOutcome };

/** Where the move under way is. */
type KeepProgress = { kind: "transfer"; progress: GuestTransferProgress } | { kind: "merge"; progress: GuestMergeProgress };

/**
 * For a user who logged in where a guest studied before (docs/guest-mode.md):
 * the offer to keep the guest's study in their Pod — added to an instance
 * they have, or, when they have none, as a new one — or to discard it, or
 * to leave it for now; then the move, step by step, and how it ended.
 * Nothing to see when no guest studied in this browser.
 */
export function GuestStudyOffer({ useCases, session }: { useCases: UseCases; session: Session }) {
  const { t } = useI18n();
  const [outcome, setOutcome] = useState<KeepOutcome | null>(null);
  // Mounted throughout, so a screen reader hears that the move succeeded: a
  // live region inserted along with its text often goes unheard. A failure
  // is heard through its panel, which takes the focus, so it is not said twice.
  return (
    <>
      <p class="visually-hidden" role="status">
        {outcome === null ? "" : keptText(t, outcome)}
      </p>
      <GuestStudyOfferStage useCases={useCases} session={session} outcome={outcome} onOutcome={setOutcome} />
    </>
  );
}

/** What a move that succeeded says; nothing for one that failed. */
function keptText(t: I18n["t"], { kind, outcome }: KeepOutcome): string {
  if (!outcome.ok) return "";
  if (kind === "transfer") return t(outcome.tidied ? "guestOffer.moved" : "guestOffer.movedNotTidied");
  return t(outcome.tidied ? "guestOffer.added" : "guestOffer.addedNotTidied", { name: outcome.instance.name });
}

/**
 * Where the offer is: the offer itself, the form, the move under way, or
 * how it ended. Each stage takes the focus from the one it replaces, all
 * but the offer as the page loads and a move that succeeded (the instance
 * it opens takes it); Back and Cancel give it to the offer.
 */
function GuestStudyOfferStage({
  useCases,
  session,
  outcome,
  onOutcome,
}: {
  useCases: UseCases;
  session: Session;
  outcome: KeepOutcome | null;
  onOutcome: (outcome: KeepOutcome | null) => void;
}) {
  const { t, errorText } = useI18n();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<Stage>("offer");
  /** The user came back to the offer, from the form or the discard question: it takes the focus. */
  const [returned, setReturned] = useState(false);
  const [progress, setProgress] = useState<KeepProgress | null>(null);

  const studyQuery = useQuery({
    queryKey: ["guestStudy"],
    queryFn: () => useCases.findGuestStudy(),
  });

  const discard = useMutation({
    mutationFn: () => useCases.discardGuest(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["guestStudy"] }),
  });

  /** The move is over: say how, and open the instance it went into. */
  async function ended(result: KeepOutcome) {
    setProgress(null);
    onOutcome(result);
    if (!result.outcome.ok) {
      // Decks added before adding failed are in the instance: its lists, which may be on screen, are read again, while the user reads why.
      if (result.kind === "merge" && result.outcome.added.length > 0) void queryClient.invalidateQueries();
      return;
    }
    // The user's instances have changed, and so may every list of the instance: its decks, groups and statistics.
    await queryClient.invalidateQueries();
    window.location.hash = routeToHash({ screen: "home", instanceUrl: result.outcome.instance.url });
  }

  const move = useMutation({
    mutationFn: (args: { instance: Instance; target: { containerUrl: string; registrationTarget: RegistrationTarget } }) =>
      useCases.transferGuestStudy(session, args.instance, args.target, (step) =>
        setProgress({ kind: "transfer", progress: step }),
      ),
    // A new move starts without the last one's steps.
    onMutate: () => setProgress(null),
    onSuccess: (result) => ended({ kind: "transfer", outcome: result }),
  });

  const merge = useMutation({
    mutationFn: (args: { instance: Instance; target: Instance; skip: string[] }) =>
      useCases.mergeGuestStudy(session, args.instance, args.target, { skip: args.skip }, (step) =>
        setProgress({ kind: "merge", progress: step }),
      ),
    onMutate: () => setProgress(null),
    onSuccess: (result) => ended({ kind: "merge", outcome: result }),
  });

  // Only while the move runs: one that threw (rather than ending in a failed
  // outcome) goes back to the form in the same render as its error, so the
  // form comes back knowing it has one to show.
  if (progress !== null && (move.isPending || merge.isPending)) {
    return progress.kind === "transfer" ? (
      <KeepProgressPanel
        labels={stepLabels(t)}
        steps={GUEST_TRANSFER_STEPS}
        progress={progress.progress}
        region={t("guestOffer.progressRegion")}
        progressLabel={t("guestOffer.progressLabel")}
        hint={t("guestOffer.keepOpen")}
      />
    ) : (
      <KeepProgressPanel
        labels={mergeStepLabels(t)}
        steps={GUEST_MERGE_STEPS}
        progress={progress.progress}
        region={t("guestOffer.mergeProgressRegion")}
        progressLabel={t("guestOffer.mergeProgressLabel")}
        hint={t("guestOffer.mergeKeepOpen")}
      />
    );
  }

  if (outcome !== null) {
    const close = () => onOutcome(null);
    if (outcome.kind === "transfer") {
      return outcome.outcome.ok ? (
        <GuestMoved text={keptText(t, outcome)} onClose={close} />
      ) : (
        <GuestTransferFailed outcome={outcome.outcome} onClose={close} />
      );
    }
    return outcome.outcome.ok ? (
      <GuestMoved text={keptText(t, outcome)} onClose={close} />
    ) : (
      <GuestMergeFailed outcome={outcome.outcome} onClose={close} />
    );
  }

  const first = studyQuery.data?.instances[0];
  if (stage === "dismissed" || first === undefined) return null;

  if (stage === "form") {
    return (
      <GuestKeepForm
        useCases={useCases}
        session={session}
        guestInstance={first.instance}
        busy={move.isPending || merge.isPending}
        error={errorText(move.error ?? merge.error)}
        onMove={(target) => move.mutate({ instance: first.instance, target })}
        onMerge={(target, skip) => merge.mutate({ instance: first.instance, target, skip })}
        onBack={() => {
          move.reset();
          merge.reset();
          setStage("offer");
          setReturned(true);
        }}
      />
    );
  }

  return (
    // Keyed by stage: the discard question is a panel of its own, taking the focus.
    <GuestOfferRegion key={stage} focus={stage === "discard" || returned}>
      {(bodyId) => (
        <>
          <p id={stage === "discard" ? undefined : bodyId}>
            <strong>{t("guestOffer.heading")}</strong>{" "}
            {t("guestOffer.body", { name: first.instance.name, count: first.deckCount })}
          </p>
          {stage === "discard" ? (
            <>
              <p id={bodyId}>{t("guestOffer.discardConfirm")}</p>
              <div class="edit-actions">
                <button
                  class="danger"
                  onClick={() => {
                    if (!discard.isPending) discard.mutate();
                  }}
                  aria-disabled={discard.isPending}
                >
                  {t("guestOffer.discardYes")}
                </button>
                <button
                  onClick={() => {
                    if (discard.isPending) return;
                    discard.reset();
                    setStage("offer");
                    setReturned(true);
                  }}
                  aria-disabled={discard.isPending}
                >
                  {t("guestOffer.cancel")}
                </button>
              </div>
              <ErrorMessage error={errorText(discard.error)} />
            </>
          ) : (
            <div class="edit-actions">
              <button class="primary" onClick={() => setStage("form")}>
                {t("guestOffer.move")}
              </button>
              <button onClick={() => setStage("discard")}>{t("guestOffer.discard")}</button>
              <button onClick={() => setStage("dismissed")}>{t("guestOffer.notNow")}</button>
            </div>
          )}
        </>
      )}
    </GuestOfferRegion>
  );
}

/** The move under way, step by step. */
function KeepProgressPanel<Step extends string>({
  labels,
  steps,
  progress,
  region,
  progressLabel,
  hint,
}: {
  labels: Record<Step, string>;
  steps: readonly Step[];
  progress: { step: Step; done: number; total: number; part?: { done: number; total: number } };
  region: string;
  progressLabel: string;
  hint: string;
}) {
  const { t } = useI18n();
  return (
    <StepProgress
      region={region}
      steps={steps.map((entry) => ({ step: entry, label: labels[entry] }))}
      current={progress.step}
      done={progress.done}
      total={progress.total}
      part={progress.part}
      status={t("guestOffer.running", { step: labels[progress.step] })}
      progressLabel={progressLabel}
      hint={hint}
    />
  );
}

/**
 * The offer's region, described by what it asks (`bodyId`). It takes the
 * focus when `focus`; shown as the page loads, it leaves it be.
 */
function GuestOfferRegion({
  focus,
  children,
}: {
  focus: boolean;
  children: (bodyId: string) => ComponentChildren;
}) {
  const { t } = useI18n();
  const ref = usePanelFocus<HTMLDivElement>(focus);
  const bodyId = useId();
  return (
    <div
      ref={ref}
      class="warning migration"
      role="region"
      aria-label={t("guestOffer.region")}
      aria-describedby={bodyId}
      tabIndex={-1}
    >
      {children(bodyId)}
    </div>
  );
}

/**
 * Where in the user's Pod the study goes: added to one of their
 * instances, or, when they have none (or none could be listed), into a
 * new one, at a place they choose.
 */
function GuestKeepForm({
  useCases,
  session,
  guestInstance,
  busy,
  error,
  onMove,
  onMerge,
  onBack,
}: {
  useCases: UseCases;
  session: Session;
  guestInstance: Instance;
  busy: boolean;
  /** Why the last move could not start, or null. */
  error: ErrorText | null;
  onMove: (target: { containerUrl: string; registrationTarget: RegistrationTarget }) => void;
  onMerge: (target: Instance, skip: string[]) => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const instancesQuery = useQuery({
    queryKey: ["instances", session.webId],
    queryFn: () => useCases.listInstances(session),
  });
  // Back after a move that threw once under way: the steps gave way, and the
  // error, not the form's heading, is what takes their focus.
  const [cameWithError] = useState(error !== null);
  const ref = usePanelFocus<HTMLElement>(!cameWithError);
  const instances = instancesQuery.data ?? [];

  return (
    <section ref={ref} class="guest-transfer" aria-label={t("guestOffer.formHeading")} tabIndex={-1}>
      <h2>{t("guestOffer.formHeading")}</h2>
      {instancesQuery.isPending ? (
        <>
          <p>{t("guestOffer.findingInstances")}</p>
          <div class="edit-actions">
            <button type="button" onClick={onBack}>
              {t("guestOffer.back")}
            </button>
          </div>
        </>
      ) : instances.length > 0 ? (
        <GuestMergeFields
          useCases={useCases}
          guestInstance={guestInstance}
          instances={instances}
          busy={busy}
          error={error}
          cameWithError={cameWithError}
          onMerge={onMerge}
          onBack={onBack}
        />
      ) : (
        <GuestTransferFields
          useCases={useCases}
          session={session}
          busy={busy}
          error={error}
          cameWithError={cameWithError}
          onMove={onMove}
          onBack={onBack}
        />
      )}
    </section>
  );
}

/** The form's buttons: start, and Back to the offer; both ignored while a move starts. */
function FormActions({ start, busy, onBack }: { start: string; busy: boolean; onBack: () => void }) {
  const { t } = useI18n();
  return (
    <div class="edit-actions">
      <button type="submit" class="primary" aria-disabled={busy}>
        {start}
      </button>
      <button
        type="button"
        onClick={() => {
          if (!busy) onBack();
        }}
        aria-disabled={busy}
      >
        {t("guestOffer.back")}
      </button>
    </div>
  );
}

/**
 * Which of the user's instances the study is added to, and which of its
 * decks: each guest deck is offered, ticked; one the instance has from
 * the same library release says that it is added beside it, not merged.
 */
function GuestMergeFields({
  useCases,
  guestInstance,
  instances,
  busy,
  error,
  cameWithError,
  onMerge,
  onBack,
}: {
  useCases: UseCases;
  guestInstance: Instance;
  instances: readonly Instance[];
  busy: boolean;
  error: ErrorText | null;
  cameWithError: boolean;
  onMerge: (target: Instance, skip: string[]) => void;
  onBack: () => void;
}) {
  const { t, errorText, readerText, readerLang } = useI18n();
  const [chosen, setChosen] = useState<string | null>(null);
  const target = instances.find((instance) => instance.url === chosen) ?? instances[0]!;
  const planQuery = useQuery({
    queryKey: ["guestMergePlan", guestInstance.url, target.url],
    queryFn: () => useCases.planGuestMerge(guestInstance, target),
  });
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [noneChosen, setNoneChosen] = useState(false);
  const idPrefix = useId();
  const plan = planQuery.data;

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (busy || plan === undefined) return;
    const skip = plan.decks.map(({ deck }) => deck.url).filter((url) => skipped.has(url));
    if (plan.decks.length > 0 && skip.length === plan.decks.length) {
      setNoneChosen(true);
      return;
    }
    onMerge(target, skip);
  }

  function toggle(url: string) {
    const next = new Set(skipped);
    if (!next.delete(url)) next.add(url);
    setSkipped(next);
    setNoneChosen(false);
  }

  return (
    <>
      <p>{t("guestOffer.mergeExplain")}</p>
      <form onSubmit={handleSubmit}>
        {instances.length > 1 ? (
          <fieldset>
            <legend>{t("guestOffer.addTo")}</legend>
            {instances.map((instance) => (
              <label key={instance.url}>
                <input
                  type="radio"
                  name="guest-target"
                  checked={instance.url === target.url}
                  onChange={() => setChosen(instance.url)}
                  disabled={busy}
                />
                {instance.name}
              </label>
            ))}
          </fieldset>
        ) : (
          <p>{t("guestOffer.addingTo", { name: target.name })}</p>
        )}
        {plan === undefined ? (
          planQuery.isError ? (
            <ErrorMessage error={errorText(planQuery.error)} />
          ) : (
            <p>{t("guestOffer.readingStudy")}</p>
          )
        ) : (
          <fieldset>
            <legend>{t("guestOffer.decks")}</legend>
            {plan.decks.length === 0 && <p class="hint">{t("guestOffer.noDecks")}</p>}
            {plan.decks.map(({ deck, sameRelease }, index) => {
              const hintId = `${idPrefix}-same-${index}`;
              return (
                <div key={deck.url}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!skipped.has(deck.url)}
                      onChange={() => toggle(deck.url)}
                      aria-describedby={sameRelease.length > 0 ? hintId : undefined}
                      disabled={busy}
                    />
                    <span lang={readerLang(deck.title)}>{readerText(deck.title)}</span>
                  </label>
                  {sameRelease.length > 0 && (
                    <p id={hintId} class="hint">
                      {t("guestOffer.sameRelease", { name: target.name })}
                    </p>
                  )}
                </div>
              );
            })}
          </fieldset>
        )}
        <p class="hint">{t("guestOffer.leftOut")}</p>
        {plan !== undefined && plan.drafts > 0 && <p class="warning">{t("guestOffer.draftsDeleted", { count: plan.drafts })}</p>}
        <ErrorMessage error={noneChosen ? t("guestOffer.chooseDeck") : error} focus={cameWithError} />
        <FormActions start={t("guestOffer.addStart", { name: target.name })} busy={busy} onBack={onBack} />
      </form>
    </>
  );
}

/** Where in the user's Pod a new instance holds the study, and which type index registers it. */
function GuestTransferFields({
  useCases,
  session,
  busy,
  error,
  cameWithError,
  onMove,
  onBack,
}: {
  useCases: UseCases;
  session: Session;
  busy: boolean;
  error: ErrorText | null;
  cameWithError: boolean;
  onMove: (target: { containerUrl: string; registrationTarget: RegistrationTarget }) => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const storagesQuery = useQuery({
    queryKey: ["storages", session.webId],
    queryFn: () => useCases.listStorages(session),
  });
  const optionsQuery = useQuery({
    queryKey: ["registrationOptions", session.webId],
    queryFn: () => useCases.getRegistrationOptions(session),
  });
  const storages = storagesQuery.data ?? [];
  const [chosenStorage, setChosenStorage] = useState<string | null>(null);
  const storageUrl = chosenStorage ?? storages[0]?.url ?? null;
  // Suggested from the storage until the user writes their own.
  const [typedLocation, setTypedLocation] = useState<string | null>(null);
  const location = typedLocation ?? (storageUrl === null ? "" : suggestedGuestLocation(storageUrl));
  const [target, setTarget] = useState<RegistrationTarget>("private");

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (busy) return;
    onMove({ containerUrl: location.trim(), registrationTarget: target });
  }

  return (
    <>
      <p>{t("guestOffer.explain")}</p>
      <form onSubmit={handleSubmit}>
        {storagesQuery.isSuccess && storages.length === 0 && <p class="hint">{t("guestOffer.noStorage")}</p>}
        {storages.length > 1 && (
          <fieldset>
            <legend>{t("guestOffer.storage")}</legend>
            {storages.map((storage) => (
              <label key={storage.url}>
                <input
                  type="radio"
                  name="guest-storage"
                  checked={storage.url === storageUrl}
                  onChange={() => {
                    setChosenStorage(storage.url);
                    setTypedLocation(null);
                  }}
                />
                {storage.url}
              </label>
            ))}
          </fieldset>
        )}
        <label for="guest-location">{t("guestOffer.location")}</label>
        <input
          id="guest-location"
          type="url"
          value={location}
          onInput={(e) => setTypedLocation(e.currentTarget.value)}
          required
          disabled={busy}
        />
        <RegistrationTargetChooser options={optionsQuery.data ?? null} value={target} onChange={setTarget} />
        <ErrorMessage error={error} focus={cameWithError} />
        <FormActions start={t("guestOffer.start")} busy={busy} onBack={onBack} />
      </form>
    </>
  );
}

/**
 * The move succeeded. It takes no focus: the status line above says so,
 * and the move opens the instance, whose screen takes the focus.
 */
function GuestMoved({ text, onClose }: { text: string; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div class="guest-moved">
      {/* Announced by the status line above; this is what is seen. */}
      <p aria-hidden="true">{text}</p>
      <button onClick={onClose}>{t("guestOffer.close")}</button>
    </div>
  );
}

/**
 * Where a move failed, and what is where now. It takes the progress's
 * place and its focus, read out with why as its description; Close hands
 * the focus to the screen.
 */
function KeepFailedPanel({
  region,
  why,
  error,
  children,
  onClose,
}: {
  region: string;
  why: string;
  error: unknown;
  children: ComponentChildren;
  onClose: () => void;
}) {
  const { t, errorText } = useI18n();
  const ref = usePanelFocus<HTMLDivElement>();
  const whyId = useId();
  return (
    <div ref={ref} class="warning migration" role="region" aria-label={region} aria-describedby={whyId} tabIndex={-1}>
      <div id={whyId} class="failure-why">
        <strong>{why}</strong> {errorText(error)}
      </div>
      {children}
      <div class="edit-actions">
        <button onClick={onClose}>{t("guestOffer.close")}</button>
      </div>
    </div>
  );
}

/** The move into a new instance failed: the study is still here, and what became of the copy. */
function GuestTransferFailed({
  outcome,
  onClose,
}: {
  outcome: Extract<GuestTransferOutcome, { ok: false }>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <KeepFailedPanel
      region={t("guestOffer.failedRegion")}
      why={t("guestOffer.failedWhile", { step: stepLabels(t)[outcome.step].toLowerCase() })}
      error={outcome.error}
      onClose={onClose}
    >
      <p>
        {t("guestOffer.stillHere")}{" "}
        {outcome.cleanedUp
          ? t("guestOffer.copyRemoved")
          : t("guestOffer.copyLeft", { url: String(outcome.leftoverUrl) })}
      </p>
    </KeepFailedPanel>
  );
}

/** Adding the study to an instance failed: which decks are there now, whole, and that the study is still here. */
function GuestMergeFailed({
  outcome,
  onClose,
}: {
  outcome: Extract<GuestMergeOutcome, { ok: false }>;
  onClose: () => void;
}) {
  const { t, readerText, readerLang } = useI18n();
  const name = outcome.instance.name;
  return (
    <KeepFailedPanel
      region={t("guestOffer.mergeFailedRegion")}
      why={t("guestOffer.mergeFailedWhile", { step: mergeStepLabels(t)[outcome.step].toLowerCase() })}
      error={outcome.error}
      onClose={onClose}
    >
      {outcome.added.length === 0 ? (
        <p>{t("guestOffer.nothingAdded", { name })}</p>
      ) : (
        <>
          <p>{t("guestOffer.keptDecks", { name, count: outcome.added.length })}</p>
          <ul>
            {outcome.added.map((deck) => (
              <li key={deck.url} lang={readerLang(deck.title)}>
                {readerText(deck.title)}
              </li>
            ))}
          </ul>
        </>
      )}
      <p>{t("guestOffer.stillHereRetry", { name })}</p>
    </KeepFailedPanel>
  );
}
