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
import type { CartEntry, SubmissionCart } from "./SubmissionCart";
import { announce, describeCartChange } from "../lib/announcer";

/** `entries` is the caller's own `useCart(cart)` result: App already holds
 *  one, and a second subscription re-parsed the whole cart on every event. */
export function useCartAnnouncements(cart: SubmissionCart, entries: CartEntry[]): void {
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
