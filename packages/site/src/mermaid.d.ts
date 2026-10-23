// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Mermaid as its bundle sets it on the drawing page, for the callbacks
 * drawDiagrams.ts runs there: the two calls they make.
 */
declare global {
  var mermaid: {
    initialize(config: Record<string, unknown>): void;
    render(id: string, text: string): Promise<{ svg: string }>;
  };
}

export {};
