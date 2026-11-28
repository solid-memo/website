// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import {
  DEFAULT_INVALID_DATA_POLICY,
  type InvalidDataPolicy,
} from "@solid-memo/domain/invalidDataPolicy";
import {
  arrangementSetAside,
  deckSetAside,
  holdOf,
  type CheckState,
  type HoldReason,
  type HoldTarget,
  type UnclaimedDeck,
  type ValidationReport,
} from "@solid-memo/domain/validation";
import { queries } from "./queries";

/** What the check of an instance, made when it is opened, lets the screens change (docs/validation.md). */
export interface DataCheck {
  /** The user's invalid data policy; "block the instance" until the preferences are read. */
  policy: InvalidDataPolicy;
  /** The check is not in yet (nor, when there is none, are the preferences). */
  pending: boolean;
  /**
   * Why the check could not be made. A policy that holds invalid data
   * back then holds everything back, as while the check is not in: what
   * the check would have found is not known.
   */
  error: Error | null;
  /** The check is not in, or could not be made: under a policy that holds data back, nothing is known to be valid. */
  unsettled: boolean;
  /** The check's report when the data does not conform; else null. */
  report: ValidationReport | null;
  /** The decks whose documents the check found unclaimed, conforming or not: none until it is in. */
  unclaimed: readonly UnclaimedDeck[];
  /** Under "set invalid data aside", a deck with invalid data: read-only until it is fixed. */
  isSetAside: (deck: Deck) => boolean;
  /** Under "set invalid data aside", the catalog or a deck group has invalid data: the arrangement is read-only. */
  arrangementSetAside: boolean;
  /**
   * Why nothing may be written to `target` (the instance, its catalog, a
   * list of decks or one deck), or null when it may be: holdOf in the
   * domain, which every screen asks rather than combine the parts above.
   */
  hold: (target: HoldTarget) => ReadOnlyReason | null;
}

/** Why the check holds a write back (holdOf in the domain). */
export type ReadOnlyReason = HoldReason;

/**
 * The check of the instance at `instanceUrl` (null: none open), the same
 * query as Solid Memo's workspace makes (queries.instanceCheck), so it is
 * made once; and the policy it is held to.
 */
export function useDataCheck(useCases: UseCases, instanceUrl: string | null): DataCheck {
  const preferencesQuery = useQuery(queries.preferences(useCases, instanceUrl));
  const checkQuery = useQuery(queries.instanceCheck(useCases, instanceUrl));
  // Until the preferences are read, as under "block the instance": a user who chose it never sees data before the check.
  const policy =
    preferencesQuery.data?.invalidDataPolicy ??
    (preferencesQuery.isPending ? "block-instance" : DEFAULT_INVALID_DATA_POLICY);
  const report =
    checkQuery.data !== undefined && !checkQuery.data.conforms ? checkQuery.data : null;
  const setsAside = report !== null && policy === "block-subject";
  const isSetAside = (deck: Deck) => setsAside && deckSetAside(report, deck);
  // A check that fails holds back as one not in yet: the instance stays held while it cannot be checked.
  const unsettled = checkQuery.isPending || checkQuery.isError;
  const state: CheckState = {
    policy,
    status: checkQuery.isError ? "failed" : (checkQuery.data ?? "pending"),
  };
  return {
    policy,
    pending: checkQuery.isPending,
    error: checkQuery.error,
    unsettled,
    report,
    unclaimed: checkQuery.data?.unclaimed ?? [],
    isSetAside,
    arrangementSetAside: setsAside && arrangementSetAside(report),
    hold: (target) => holdOf(state, target),
  };
}
