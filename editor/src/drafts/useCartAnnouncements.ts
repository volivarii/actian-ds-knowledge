// Speak the batch's changes, once per commit, as sentences a reader can act
// on. Diffed from the entries rather than taken from the cart's events,
// because `add()` emits "added" for a REPLACED entry too (every debounced
// autosave), a staged deletion arrives as "added", and two adds in one tick
// would each overwrite the last.
//
// A clear is the exception: the actor that clears says why ("Pull request
// opened", "Batch cleared"), and a removal sentence from this diff would
// overwrite it. The "cleared" event marks the next diff as already spoken.
import { useEffect, useRef } from "react";
import type { SubmissionCart } from "./SubmissionCart";
import { useCart } from "./useCart";
import { announce, describeCartChange } from "../lib/announcer";

export function useCartAnnouncements(cart: SubmissionCart): void {
  const entries = useCart(cart);
  const previous = useRef(entries);
  const clearedByActor = useRef(false);
  useEffect(
    () =>
      cart.subscribe((event) => {
        if (event.kind === "cleared") clearedByActor.current = true;
      }),
    [cart],
  );
  useEffect(() => {
    const message = describeCartChange(previous.current, entries);
    previous.current = entries;
    if (clearedByActor.current) {
      clearedByActor.current = false;
      return;
    }
    if (message) announce(message);
  }, [entries]);
}
