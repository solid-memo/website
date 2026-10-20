// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  instanceGraphOf,
  type GraphDocument,
  type InstanceGraph,
} from "@solid-memo/domain/instanceGraph";
import {
  digestUrlOf,
  ensureTrailingSlash,
  historyUrlOf,
  instanceDocumentUrls,
  isDocumentIn,
} from "@solid-memo/domain/instanceLayout";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import type {
  AnswerLog,
  DeckRepository,
  InstanceGraphReader,
  ReleaseDraftRepository,
  ReleasePublisher,
  StorageGateway,
} from "./ports";

/**
 * An instance read as a graph (domain/instanceGraph.ts), for the Studio
 * to draw: every document Solid Memo keeps in it, found as the instance
 * check finds them (its meta, preferences and catalog documents, each
 * deck's cards and reviews, the digest, the answer log's months, the
 * drafts' documents and the releases published in it), and nothing
 * else. The catalog is data anyone may have written: a document it names
 * outside the instance (or that climbs out of it, by `..`) is not read,
 * and no IRI a document names is. A document that cannot be read is
 * drawn as such, the rest still drawn: a broken instance is where the
 * graph helps most. The user's storages, which tell the leaves in their
 * pod apart, are found from their WebID as at login; none, when they
 * cannot be.
 */

/** How many documents are read at once: as many as a browser asks one server for over HTTP/1.1. */
const READS_AT_ONCE = 6;

export interface InstanceGraphUseCases {
  /**
   * The instance's Solid Memo data as a graph, the user's storages (those
   * of `webId`) telling which leaves are in their pod. `onProgress` is
   * told how many documents are read of how many, from none.
   */
  readInstanceGraph(
    instanceUrl: string,
    webId: string,
    options?: { onProgress?: (read: number, total: number) => void },
  ): Promise<InstanceGraph>;
}

export function createInstanceGraphUseCases({
  instanceGraphReader,
  storageGateway,
  deckRepository,
  answerLog,
  releaseDraftRepository,
  releasePublisher,
}: {
  instanceGraphReader: InstanceGraphReader;
  storageGateway: StorageGateway;
  deckRepository: DeckRepository;
  answerLog: AnswerLog;
  releaseDraftRepository: ReleaseDraftRepository;
  releasePublisher: ReleasePublisher;
}): InstanceGraphUseCases {
  /** Every document of the instance, each once, none outside it. */
  async function documentUrls(instanceUrl: string): Promise<string[]> {
    const [decks, months, drafts, releases] = await Promise.all([
      deckRepository.listDecks(instanceUrl),
      answerLog.months(instanceUrl),
      releaseDraftRepository.documents(instanceUrl),
      releasePublisher.listPublished(instanceUrl),
    ]);
    const root = ensureTrailingSlash(instanceUrl);
    const urls = [
      ...instanceDocumentUrls(instanceUrl, decks),
      digestUrlOf(instanceUrl),
      ...months.map((month) => historyUrlOf(instanceUrl, month)),
      ...drafts,
      ...releases,
    ];
    // As deleting an instance's data does: a deck's document by its address, never a folder.
    return [...new Set(urls.map(documentUrlOf))].filter((url) => isDocumentIn(url, root));
  }

  return {
    async readInstanceGraph(instanceUrl, webId, { onProgress = () => undefined } = {}) {
      const [urls, storages] = await Promise.all([
        documentUrls(instanceUrl),
        storageGateway.discoverStorages(webId).catch(() => []),
      ]);
      const documents: GraphDocument[] = new Array(urls.length);
      let next = 0;
      let read = 0;
      onProgress(read, urls.length);
      // A few at a time, in turn: a large log's months are not all asked for at once.
      const reader = async () => {
        while (next < urls.length) {
          const at = next++;
          const url = urls[at]!;
          documents[at] = await instanceGraphReader.readDocument(url).then(
            (triples) => ({ url, found: triples !== null, triples: triples ?? [] }),
            () => ({ url, found: false, unreadable: true, triples: [] }),
          );
          onProgress(++read, urls.length);
        }
      };
      await Promise.all(Array.from({ length: READS_AT_ONCE }, reader));
      return instanceGraphOf({
        instanceUrl,
        storages: storages.map((storage) => storage.url),
        documents,
      });
    },
  };
}
