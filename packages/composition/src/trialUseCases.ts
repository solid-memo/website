// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { SessionGateway } from "@solid-memo/application/ports";
import type { TrialSandbox } from "@solid-memo/application/trial";
import { createUseCases, type Dependencies } from "@solid-memo/application/useCases";
import { DEFAULT_PALETTE } from "@solid-memo/domain/palette";
import { DEFAULT_TEXT_SIZE } from "@solid-memo/domain/textSize";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { TRIAL_ORIGIN } from "@solid-memo/domain/release/trial";
import { createDraftDeckLibrary } from "@solid-memo/solid/draftDeckLibrary";
import { createLocalGuestPod } from "@solid-memo/solid/localGuestPod";
import { createLocalPod } from "@solid-memo/solid/localPod";
import { createMemoryResourceStore } from "@solid-memo/solid/memoryResourceStore";
import { routedFetch } from "@solid-memo/solid/routedFetch";
import type { ShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidAnswerLog } from "@solid-memo/solid/solidAnswerLog";
import { createSolidDeckRepository } from "@solid-memo/solid/solidDeckRepository";
import { createSolidDigestRepository } from "@solid-memo/solid/solidDigestRepository";
import { createSolidInstanceCopier } from "@solid-memo/solid/solidInstanceCopier";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { createSolidPreferencesRepository } from "@solid-memo/solid/solidPreferencesRepository";
import { createSolidRepairRepository } from "@solid-memo/solid/solidRepairRepository";
import { createSolidReviewStateRepository } from "@solid-memo/solid/solidReviewStateRepository";
import { createSolidStorageGateway } from "@solid-memo/solid/solidStorageGateway";
import { createSolidWebIdDocumentRepository } from "@solid-memo/solid/solidWebIdDocumentRepository";

/** What a trial takes from the page it is played in. */
export interface TrialWiring {
  /** The page's pod requests: a trial reads through them, and never writes (readOnlyFetch). */
  podFetch: typeof globalThis.fetch;
  /** The page's validator: a trial's writes are checked by the same shapes. */
  shapeValidator: ShaclShapeValidator;
  /** Names the shapes documents are checked by. */
  ruleset: string;
}

/**
 * A new sandbox to test-play the draft in (docs/studio.md, The trial): a
 * pod of its own, kept in memory (a fresh store each time), at the
 * trial's origin; any other request goes to the page's pods, read only.
 * Over it, the Solid adapters and the use cases, as the page's own,
 * with a library of the draft alone, read afresh each time
 * (createDraftDeckLibrary): the page's library keeps what it reads, as
 * the releases of decks/ never change, and a draft does. No login, no
 * language, theme or update journal of the device: none of it is the
 * trial's.
 */
export function createTrialUseCases(
  draft: ReleaseDraft,
  { podFetch, shapeValidator, ruleset }: TrialWiring,
): TrialSandbox {
  const store = createMemoryResourceStore();
  const local = createLocalPod({
    root: TRIAL_ORIGIN,
    store,
    newEtag: () => `"${crypto.randomUUID()}"`,
  });
  const fetch = routedFetch({ origin: TRIAL_ORIGIN, local, remote: readOnlyFetch(podFetch) });
  const validator = shapeValidator.over(fetch);
  const checkWrite = validator.checkSubjects;
  const now = () => new Date();
  const randomId = () => crypto.randomUUID();
  const useCases = createUseCases({
    sessionGateway: NO_LOGIN,
    ...NO_DEVICE,
    webIdDocumentRepository: createSolidWebIdDocumentRepository({ fetch }),
    storageGateway: createSolidStorageGateway({ fetch }),
    instanceRepository: createSolidInstanceRepository({ fetch, checkWrite, now, randomId }),
    deckRepository: createSolidDeckRepository({ fetch, checkWrite, now, randomId }),
    deckLibrary: createDraftDeckLibrary(draft),
    preferencesRepository: createSolidPreferencesRepository({ fetch, checkWrite }),
    reviewStateRepository: createSolidReviewStateRepository({ fetch, checkWrite }),
    shapeValidator: validator,
    repairRepository: createSolidRepairRepository({ fetch }),
    instanceCopier: createSolidInstanceCopier({ fetch }),
    digestRepository: createSolidDigestRepository({ fetch, checkWrite }),
    answerLog: createSolidAnswerLog({ fetch, checkWrite }),
    ruleset,
  });
  return {
    // The draft is the author's own, unpublished: a mistake in it is reported nowhere, least of all to the library.
    useCases: { ...useCases, reportPlace: async () => ({ library: false }) },
    pod: createLocalGuestPod({ fetch: local, store, origin: TRIAL_ORIGIN }),
  };
}

/**
 * The fetch, for reads only: a request of any method but GET and HEAD is
 * refused before it is sent, so a trial never writes to a real pod.
 */
export function readOnlyFetch(fetch: typeof globalThis.fetch): typeof globalThis.fetch {
  return (input, init) => {
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      const url = input instanceof Request ? input.url : String(input);
      return Promise.reject(new Error(`A trial does not write to ${url} (${method}).`));
    }
    return fetch(input, init);
  };
}

/** A trial has no login: its learner is no one's. */
const noLogin = async (): Promise<never> => {
  throw new Error("A trial has no login.");
};

export const NO_LOGIN: SessionGateway = {
  restore: async () => null,
  onSessionExpired: () => () => undefined,
  discoverOidcIssuer: noLogin,
  login: noLogin,
  loginWithIssuer: noLogin,
  logout: noLogin,
};

/**
 * What the device keeps of how the app is shown, none of which is a
 * trial's: the page's language, theme, palette and text size are the
 * page's, so a trial keeps no choice of them, and it has no palettes of
 * its own.
 */
export const NO_DEVICE: Pick<
  Dependencies,
  | "languagePreference"
  | "themePreference"
  | "palettePreference"
  | "customPalettePreference"
  | "textSizePreference"
  | "paletteRepository"
> = {
  languagePreference: { chosen: () => null, choose: () => undefined },
  themePreference: { chosen: () => "system", choose: () => undefined },
  palettePreference: { chosen: () => DEFAULT_PALETTE, choose: () => undefined },
  customPalettePreference: { chosen: () => null, choose: () => undefined },
  textSizePreference: { chosen: () => DEFAULT_TEXT_SIZE, choose: () => undefined },
  paletteRepository: {
    listPalettes: async () => [],
    savePalette: async () => {
      throw new Error("A trial keeps no palettes.");
    },
  },
};
