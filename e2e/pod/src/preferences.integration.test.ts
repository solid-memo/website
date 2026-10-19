// @vitest-environment node

// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The preferences against a real Solid server (docs/data-model.md): a
 * new instance's are stated, FSRS-6 their scheduler, and every value a
 * save or "Not now" to the invitation to switch to FSRS-6 writes is read
 * back as written, true among them, which node-solid-server stores as
 * false when a PATCH inserts it.
 */
import { describe, expect, inject, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { createUseCases } from "@solid-memo/application/useCases";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidAnswerLog } from "@solid-memo/solid/solidAnswerLog";
import { createSolidDeckRepository } from "@solid-memo/solid/solidDeckRepository";
import { createSolidDigestRepository } from "@solid-memo/solid/solidDigestRepository";
import { createSolidInstanceCopier } from "@solid-memo/solid/solidInstanceCopier";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { createSolidPreferencesRepository } from "@solid-memo/solid/solidPreferencesRepository";
import { createSolidRepairRepository } from "@solid-memo/solid/solidRepairRepository";
import { createSolidReviewStateRepository } from "@solid-memo/solid/solidReviewStateRepository";
import { createSolidWebIdDocumentRepository } from "@solid-memo/solid/solidWebIdDocumentRepository";
import { createWriteFence } from "@solid-memo/solid/writeFence";

const SERVERS = inject("solidServers");

/** A page of the app as createAppUseCases wires it, its answers logged. */
function page() {
  const writeFence = createWriteFence(fetch);
  const podFetch = writeFence.fetch;
  const shapeValidator = createShaclShapeValidator({
    fetch: podFetch,
    shapesFetch,
    ...SHAPE_SOURCES,
  });
  const checkWrite = shapeValidator.checkSubjects;
  const deps = {
    fetch: podFetch,
    checkWrite,
    now: () => new Date(),
    randomId: () => crypto.randomUUID(),
  };
  return createUseCases({
    sessionGateway: undefined as never,
    storageGateway: undefined as never,
    deckLibrary: undefined as never,
    webIdDocumentRepository: createSolidWebIdDocumentRepository({ fetch: podFetch }),
    instanceRepository: createSolidInstanceRepository(deps),
    deckRepository: createSolidDeckRepository(deps),
    preferencesRepository: createSolidPreferencesRepository({ fetch: podFetch, checkWrite }),
    reviewStateRepository: createSolidReviewStateRepository({ fetch: podFetch, checkWrite }),
    shapeValidator,
    repairRepository: createSolidRepairRepository({ fetch: podFetch }),
    instanceCopier: createSolidInstanceCopier({ fetch: podFetch }),
    writeFence,
    digestRepository: createSolidDigestRepository({ fetch: podFetch, checkWrite }),
    answerLog: createSolidAnswerLog({ fetch: podFetch, checkWrite }),
    ruleset: "e2e-rules",
  });
}

/** A new instance in a pod of its own, as a learner makes one. */
async function seed(server: string): Promise<string> {
  const base = new URL(`preferences-${crypto.randomUUID()}/`, server).href;
  const webId = `${base}profile/card.ttl#me`;
  const typeIndex = `${base}settings/privateTypeIndex.ttl`;
  const put = async (url: string, body: string) => {
    const response = await fetch(url, {
      method: "PUT",
      headers: { "content-type": "text/turtle" },
      body,
    });
    if (!response.ok) throw new Error(`Seeding ${url}: ${response.status}`);
  };
  await put(
    `${base}profile/card.ttl`,
    `<#me> <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${typeIndex}> .`,
  );
  await put(
    typeIndex,
    `<> a <http://www.w3.org/ns/solid/terms#TypeIndex>, <http://www.w3.org/ns/solid/terms#UnlistedDocument> .`,
  );
  const instance = await page().createInstance(
    { webId },
    { containerUrl: `${base}solid-memo/`, name: "Main", registrationTarget: "private" },
  );
  return instance.url;
}

describe.each(SERVERS)("preferences on $name", ({ url: server }) => {
  it('states a new instance\'s, FSRS-6 their scheduler, and keeps "Not now" and every value saved as written', async () => {
    const instanceUrl = await seed(server);
    const made = await page().getPreferences(instanceUrl);
    expect(made).toMatchObject({ scheduler: "fsrs6", schedulerInvitationDismissed: false });
    expect((await page().validateInstance(instanceUrl)).conforms).toBe(true);

    await page().dismissSchedulerInvitation(instanceUrl);
    expect(await page().getPreferences(instanceUrl)).toEqual({
      ...made,
      schedulerInvitationDismissed: true,
    });

    const saved = { ...made, developerMode: true, newCardsPerDay: 7, desiredRetention: 0.85 };
    await page().savePreferences(instanceUrl, saved);
    // "Not now" is kept, though the preferences saved were read before it.
    expect(await page().getPreferences(instanceUrl)).toEqual({
      ...saved,
      schedulerInvitationDismissed: true,
    });
    expect((await page().validateInstance(instanceUrl)).conforms).toBe(true);
  });
});
