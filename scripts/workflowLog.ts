// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Text a check prints into a workflow's log that holds a commit's
 * message, such as its subject, made inert. The runner of GitHub's
 * workflows reads a line of the log that starts with `::`, after any
 * blank space (U+0085 too), as a workflow command, and a line that
 * holds `##[` anywhere as one in the older syntax; it ends a line at a
 * carriage return as at a line feed. A backslash before each (`\::`, `##\[`)
 * keeps the text readable and reads as no command.
 */
export function inert(text: string): string {
  return text
    .replaceAll("##[", "##\\[")
    .replace(/(^|[\r\n])((?:[^\S\r\n]|\u0085)*)::/g, "$1$2\\::");
}
