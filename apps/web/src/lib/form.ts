import type { SyntheticEvent } from 'react';

/**
 * A form submit event.
 *
 * `SyntheticEvent` rather than React's `FormEvent`, which its own types now mark
 * deprecated. `currentTarget` is the form, which is all these handlers need.
 */
export type FormSubmitEvent = SyntheticEvent<HTMLFormElement>;

/**
 * Reads one text field out of a submitted form.
 *
 * `FormData.get` returns `string | File | null`, and stringifying a `File`
 * yields `"[object File]"` — a value that would sail through validation and
 * reach the API. Anything that is not already a string is treated as absent.
 */
export function readField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

/** The submitted form's values, for handlers that read several fields. */
export function formDataOf(event: FormSubmitEvent): FormData {
  return new FormData(event.currentTarget);
}
