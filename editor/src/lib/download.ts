// Hand the reader a file.
//
// Kept out of the screens because every export wants the same three careless
// mistakes avoided: an object URL that is never revoked (the blob stays in
// memory for the life of the tab), an anchor left in the document, and a
// filename with no date on it, which is how two exports taken a month apart
// become indistinguishable in a downloads folder.

import { measuredToday } from "./measure";

/**
 * Download `text` as a file named `<stem>-<today>.<ext>`.
 *
 * The date comes from `measuredToday`, the same stamp the Meters carry, so an
 * exported file and the screen it came from agree about when they were taken.
 */
export function downloadText(
  text: string,
  stem: string,
  ext: string,
  mime: string,
): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${stem}-${measuredToday()}.${ext}`;
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    // Both, always. An early return or a throw between these used to be how a
    // stray anchor ended up in the DOM.
    a.remove();
    URL.revokeObjectURL(url);
  }
}

export function downloadCsv(text: string, stem: string): void {
  downloadText(text, stem, "csv", "text/csv");
}
