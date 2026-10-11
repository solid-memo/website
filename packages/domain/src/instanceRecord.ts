// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { InstanceMeta } from "./instance";
import type { InstanceV2 } from "@solid-memo/vocab/types.generated";

/** An instance's meta document between its shape record and the model. */
export function instanceMetaFromRecord(storedVersion: number, data: InstanceV2): InstanceMeta {
  return {
    name: data.title,
    createdAt: data.created,
    formatVersion: storedVersion,
    ...(data.replaces === undefined ? {} : { replaces: data.replaces }),
    ...(data.modified === undefined ? {} : { replacedAt: data.modified }),
  };
}

export function instanceMetaToRecord(meta: InstanceMeta): InstanceV2 {
  return {
    title: meta.name,
    created: meta.createdAt,
    ...(meta.replaces === undefined ? {} : { replaces: meta.replaces }),
    ...(meta.replacedAt === undefined ? {} : { modified: meta.replacedAt }),
  };
}
