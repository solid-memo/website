// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/*
 * The types more than one module of ports/ needs; each other type stays with its port.
 */

/**
 * A document's contents as of now, with the version (ETag) they are at,
 * or word that it is still at the version the caller knew (a document
 * there is none of is at ABSENT_VERSION, domain/studyDigest.ts).
 */
export type Since<T> = { unchanged: true } | { unchanged: false; value: T; version: string | null };
