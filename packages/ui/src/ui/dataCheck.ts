import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { DEFAULT_INVALID_DATA_POLICY, type InvalidDataPolicy } from "@solid-memo/domain/invalidDataPolicy";
import { arrangementSetAside, setAsideDecks, type ValidationReport } from "@solid-memo/domain/validation";

/** What the check of an instance, made when it is opened, lets the screens change (docs/validation.md). */
export interface DataCheck {
  /** The user's invalid data policy; "block the instance" until the preferences are read. */
  policy: InvalidDataPolicy;
  /** The check is not in yet (nor, when there is none, are the preferences). */
  pending: boolean;
  /** Why the check could not be made: it then sets nothing aside. */
  error: Error | null;
  /** The check's report when the data does not conform; else null. */
  report: ValidationReport | null;
  /** Under "set invalid data aside", a deck with invalid data: read-only until it is repaired. */
  isSetAside: (deck: Deck) => boolean;
  /** Under "set invalid data aside", the catalogue or a deck group has invalid data: the arrangement is read-only. */
  arrangementSetAside: boolean;
  /**
   * Why nothing may be written to the instance, or (given) to the deck:
   * "checking" until the check is done (a policy that sets data aside
   * may yet set it aside), "blocked" under "block the instance" with
   * invalid data, "setAside" for a deck set aside; null when it may be.
   * Under "only warn" nothing waits. What another app wrote only warns,
   * and sets nothing aside.
   */
  readOnly: (deck?: Deck) => ReadOnlyReason | null;
}

export type ReadOnlyReason = "checking" | "blocked" | "setAside";

/**
 * The check of the instance at `instanceUrl` (null: none open), the same
 * query as Solid Memo's workspace makes (["validation", url]), so it is
 * made once, and made again after a repair; and the policy it is held to.
 */
export function useDataCheck(useCases: UseCases, instanceUrl: string | null): DataCheck {
  const preferencesQuery = useQuery({
    queryKey: ["preferences", instanceUrl],
    queryFn: () => useCases.getPreferences(instanceUrl!),
    enabled: instanceUrl !== null,
  });
  const checkQuery = useQuery({
    queryKey: ["validation", instanceUrl],
    queryFn: () => useCases.checkInstance(instanceUrl!),
    enabled: instanceUrl !== null,
    staleTime: Infinity,
  });
  // Until the preferences are read, as under "block the instance": a user who chose it never sees data before the check.
  const policy =
    preferencesQuery.data?.invalidDataPolicy ?? (preferencesQuery.isPending ? "block-instance" : DEFAULT_INVALID_DATA_POLICY);
  const report = checkQuery.data !== undefined && !checkQuery.data.conforms ? checkQuery.data : null;
  const setsAside = report !== null && policy === "block-subject";
  const isSetAside = (deck: Deck) => setsAside && setAsideDecks(report, [deck]).size > 0;
  return {
    policy,
    pending: checkQuery.isPending,
    error: checkQuery.error,
    report,
    isSetAside,
    arrangementSetAside: setsAside && arrangementSetAside(report),
    readOnly(deck) {
      if (policy === "warn-only") return null;
      if (checkQuery.isPending) return "checking";
      if (report !== null && policy === "block-instance") return "blocked";
      return deck !== undefined && isSetAside(deck) ? "setAside" : null;
    },
  };
}
