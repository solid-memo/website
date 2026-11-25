// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * What `derive` makes of `value`, worked out once while `value` is
 * frozen and kept in `kept` for the next caller: a frozen array never
 * changes, so what was derived of it stays true. Several decks may name
 * one cards document, and its cards, read once, are one frozen array
 * (the repository's readCardsSince); what is derived of them here is
 * then worked out once, not once per deck. Of a value not frozen, which
 * may still change, it is worked out each time.
 */
export function derivedOnce<T extends object, R>(
  kept: WeakMap<T, R>,
  value: T,
  derive: (value: T) => R,
): R {
  // Looked up first: a value kept was frozen, and stays so. Whether one is
  // frozen may take a pass over its properties (an object of many keys).
  if (kept.has(value)) return kept.get(value)!;
  if (!Object.isFrozen(value)) return derive(value);
  const derived = derive(value);
  kept.set(value, derived);
  return derived;
}

/**
 * What `derive` makes of two values together, of the kind `key` names
 * (the other inputs it goes by, such as a direction), worked out once
 * while both are frozen (derivedOnce): a deck's cards and its review
 * states, which the decks that name one cards document and one reviews
 * document share, as read once, give each deck the same schedule and
 * progress. Of values not frozen it is worked out each time.
 */
export function derivedOnceOf<A extends object, B extends object, R>(
  kept: WeakMap<A, WeakMap<B, Map<string, R>>>,
  first: A,
  second: B,
  key: string,
  derive: () => R,
): R {
  // Looked up first, as derivedOnce does.
  let byKey = kept.get(first)?.get(second);
  if (byKey?.has(key) === true) return byKey.get(key)!;
  if (!Object.isFrozen(first) || !Object.isFrozen(second)) return derive();
  let bySecond = kept.get(first);
  if (bySecond === undefined) kept.set(first, (bySecond = new WeakMap()));
  byKey = bySecond.get(second);
  if (byKey === undefined) bySecond.set(second, (byKey = new Map()));
  const derived = derive();
  byKey.set(key, derived);
  return derived;
}
