// The one polite live region, in the header, visually hidden. Everything that
// should reach a screen reader without stealing focus goes through
// `announce()` and lands here.
import { useSyncExternalStore } from "react";
import { VisuallyHidden } from "@radix-ui/themes";
import { getAnnouncement, subscribeAnnouncements } from "../lib/announcer";

export function LiveRegion() {
  const { text, seq } = useSyncExternalStore(
    subscribeAnnouncements,
    getAnnouncement,
    getAnnouncement,
  );
  // The span is keyed by seq, so announcing the same sentence twice ("Draft
  // saved", then "Draft saved" a minute later) replaces the node rather than
  // leaving the text untouched, and assistive technology reads it again.
  return (
    <VisuallyHidden aria-live="polite" aria-atomic="true">
      <span key={seq}>{text}</span>
    </VisuallyHidden>
  );
}
