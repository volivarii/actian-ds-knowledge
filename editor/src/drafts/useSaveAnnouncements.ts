// Speak drafts' saves and failures from the store's own events, which carry
// the path. Deriving them from the header badge's state failed three ways:
// the badge's `path` and `state` change one render apart, so a file switch
// read as a save; the flush when leaving a file was overwritten by the next
// file's snapshot in the same batch; and a recovery after a failure fell
// inside the quiet window.
import { useEffect } from "react";
import type { DraftStore } from "./DraftStore";
import { announce } from "../lib/announcer";

/** A save is spoken at most this often per file: autosave writes at every
 *  typing pause, and "Draft saved" every second is noise, not news. */
export const SAVE_QUIET_MS = 60_000;

export function useSaveAnnouncements(store: DraftStore, quietMs = SAVE_QUIET_MS): void {
  useEffect(() => {
    // Paths changed since their last spoken save. A save that follows no
    // change here (a snapshot on opening a drafted file) is not news.
    const changed = new Set<string>();
    const spokenAt = new Map<string, number>();
    const failed = new Set<string>();
    return store.subscribe((event) => {
      if (event.kind === "pending") {
        changed.add(event.path);
      } else if (event.kind === "failed") {
        failed.add(event.path);
        announce("Draft could not be saved");
      } else if (event.kind === "saved") {
        if (!changed.has(event.path)) return;
        changed.delete(event.path);
        const now = Date.now();
        // A save that recovers from a spoken failure is always news: the
        // reader's last information was that the draft is NOT saved.
        const recovering = failed.delete(event.path);
        if (recovering || now - (spokenAt.get(event.path) ?? 0) >= quietMs) {
          spokenAt.set(event.path, now);
          announce("Draft saved");
        }
      }
    });
  }, [store, quietMs]);
}
