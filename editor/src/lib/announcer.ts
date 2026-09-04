// One channel for what a screen reader is told, fed by whoever has something
// to say and read by the single live region in the header.
//
// F20: autosave, draft staging and validation errors used to be announced to
// nobody. A module-level store rather than context, because the producers
// (the save-state indicator, the cart) sit at different depths and one of
// them is not a component at all.

import type { CartEntry } from "../drafts/SubmissionCart";

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
 * A batch entry as a reader would name it: the FILE, not the path. A
 * `_meta.yml` names its component too (every component has one), and an
 * `_order.json` is "the foundations section order", because "_order.json for
 * src" says nothing to anyone.
 */
export function cartEntryLabel(path: string): string {
  const parts = path.split("/");
  const file = parts[parts.length - 1] ?? path;
  if (file === "_order.json") return `the ${parts[0] ?? "section"} section order`;
  if (file === "_meta.yml" && parts.length >= 2) {
    return `${file} for ${parts[parts.length - 2]}`;
  }
  return file;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * One sentence for what changed between two states of the batch, or null when
 * nothing a reader would care about did (an entry replaced by autosave). A
 * burst of changes in one commit is one sentence rather than the last of
 * several, because the live region holds a single slot.
 *
 * Keyed on path AND the deleted flag: the delete flow re-adds the same path
 * with `deleted: true`, which membership alone read as no change. A clear is
 * the actor's sentence ("Pull request opened", "Batch cleared"), spoken by
 * whoever cleared, because this diff cannot tell a submit from a discard.
 */
export function describeCartChange(
  previous: readonly CartEntry[],
  next: readonly CartEntry[],
): string | null {
  const before = new Map(previous.map((e) => [e.path, Boolean(e.deleted)]));
  const after = new Map(next.map((e) => [e.path, Boolean(e.deleted)]));
  const added: string[] = [];
  const staged: string[] = [];
  const removed: string[] = [];
  for (const [path, deleted] of after) {
    if (before.get(path) === deleted) continue; // present before, same state
    (deleted ? staged : added).push(cartEntryLabel(path));
  }
  for (const path of before.keys()) {
    if (!after.has(path)) removed.push(cartEntryLabel(path));
  }
  const parts: string[] = [];
  if (added.length) parts.push(`Added ${joinNames(added)} to the batch`);
  if (staged.length) parts.push(`Staged the deletion of ${joinNames(staged)}`);
  if (removed.length) parts.push(`Removed ${joinNames(removed)} from the batch`);
  return parts.length ? parts.join(". ") : null;
}
