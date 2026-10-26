// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { getSourceUrl } from "@inrupt/solid-client";
import {
  asUrl,
  getThingAll,
  propertiesOf,
  type SourcedDataset,
  type Subject as RdfSubject,
} from "../client/rdf";
import type { Subject, WebIdDocument } from "@solid-memo/domain/webIdDocument";

export function toWebIdDocument(dataset: SourcedDataset): WebIdDocument {
  return {
    url: getSourceUrl(dataset),
    subjects: getThingAll(dataset).map(toSubject),
  };
}

export function toSubject(thing: RdfSubject): Subject {
  return { url: asUrl(thing), properties: propertiesOf(thing) };
}
