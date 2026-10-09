/**
 * What the app does when data in an instance does not conform to its
 * shapes (see docs/validation.md): a preference, stored as a concept of
 * solid-memo:InvalidDataPolicies whose notation is the value here.
 */
export type InvalidDataPolicy = "block-instance" | "block-subject" | "warn-only";

export const INVALID_DATA_POLICIES: readonly InvalidDataPolicy[] = [
  "block-instance",
  "block-subject",
  "warn-only",
];

/**
 * Until the user says otherwise, a deck with invalid data is set aside
 * and everything else keeps working.
 */
export const DEFAULT_INVALID_DATA_POLICY: InvalidDataPolicy = "block-subject";

export function isInvalidDataPolicy(value: string): value is InvalidDataPolicy {
  return (INVALID_DATA_POLICIES as readonly string[]).includes(value);
}
