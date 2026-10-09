/**
 * Whether a key belongs to an input method composing text (Korean,
 * Japanese or Chinese, say): the Enter or Escape that commits or cancels
 * a syllable is the input method's, not the app's. Safari ends the
 * composition before the key's keydown, so there only keyCode 229 tells.
 */
export function composing(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}
