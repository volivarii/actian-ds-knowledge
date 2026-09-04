// One channel for what a screen reader is told, fed by whoever has something
// to say and read by the single live region in the header.
//
// F20: autosave, draft staging and validation errors used to be announced to
// nobody. A module-level store rather than context, because the producers
// (the save-state indicator, the cart) sit at different depths and one of
// them is not a component at all.

import type { CartEvent } from "../drafts/SubmissionCart";

export interface Announcement {
  text: string;
  /** Bumps on every call, so announcing the same text twice still re-renders. */
  seq: number;
}

let current: Announcement = { text: "", seq: 0 };
const listeners = new Set<() => void>();

export function announce(text: string): void {
  current = { text, seq: current.seq + 1 };
  for (const l of listeners) l();
}

export function getAnnouncement(): Announcement {
  return current;
}

export function subscribeAnnouncements(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * A cart event as a sentence naming the FILE, not the path: "Added forms.md
 * to the batch". A sidecar such as `_meta.yml` names its component too,
 * because every component has one and the file name alone says nothing.
 */
export function cartEventMessage(event: CartEvent): string {
  if (event.kind === "cleared") return "Batch cleared";
  const parts = event.path.split("/");
  const file = parts[parts.length - 1] ?? event.path;
  const parent = parts.length >= 2 ? parts[parts.length - 2] : null;
  const subject = file.startsWith("_") && parent ? `${file} for ${parent}` : file;
  return event.kind === "added"
    ? `Added ${subject} to the batch`
    : `Removed ${subject} from the batch`;
}
