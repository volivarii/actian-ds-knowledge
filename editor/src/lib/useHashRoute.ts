import { useEffect, useRef } from "react";
import type { ExploreTab } from "../app/HomeScreen";
import { hashFor, stateFromHash, titleFor } from "./routes";

interface UseHashRouteArgs {
  activePath: string | null;
  exploreTab: ExploreTab;
  /** Called when the address, rather than the app, decides the screen: Back,
   *  Forward, or a link pasted into the same tab. NOT called on mount: `App`
   *  seeds its state from the address synchronously, so there is nothing to
   *  correct after the first render. */
  onNavigate: (path: string | null, tab: ExploreTab | null) => void;
}

/**
 * Two hashes naming the same address.
 *
 * `location.hash` returns what the browser stored, which is the percent-encoded
 * form of whatever was assigned: writing `#/writing/tone of voice` reads back as
 * `#/writing/tone%20of%20voice`. A raw string comparison therefore read the
 * hook's own write as a reader navigation and sent the app to a path that
 * exists nowhere.
 */
function sameAddress(a: string | null, b: string | null): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  try {
    return decodeURIComponent(a) === decodeURIComponent(b);
  } catch {
    return false;
  }
}

/**
 * Keeps the URL hash and the editor's navigation state in step, in both
 * directions, and names the page in the tab title.
 *
 * Writing the address takes one of two forms, and the difference is the
 * reader's Back button. When the APP navigated, the address is assigned, which
 * pushes a history entry, so Back returns to the previous screen. When the
 * address the reader ARRIVED on already names the screen they are on, in a
 * spelling this app would not mint (a trailing slash, a tracking query, an
 * unreadable address that falls back to home), it is corrected with
 * `replaceState`, so their first Back still leaves the editor rather than
 * landing on the entry that was just rejected.
 *
 * There is deliberately no read-on-mount effect and so no first-run guard. An
 * effect that read the address after mounting would have to be stopped from
 * overwriting a deep link before its navigation committed, and every guard for
 * that built on a ref or a run count is defeated by StrictMode's double mount.
 * Seeding state from the address instead means the app is never briefly on the
 * wrong screen, in development or in production.
 */
export function useHashRoute({
  activePath,
  exploreTab,
  onNavigate,
}: UseHashRouteArgs): void {
  /** The address this hook last wrote or read. A `hashchange` matching it is
   *  our own echo, not a reader asking to go somewhere. */
  const written = useRef<string | null>(null);

  // Write the address when the app navigates.
  useEffect(() => {
    const next = hashFor(activePath, exploreTab);
    document.title = titleFor(activePath, exploreTab);
    const current = window.location.hash;
    if (sameAddress(current, next)) {
      written.current = next;
      return;
    }
    // Does the address already name this screen, just not canonically? Then
    // this is a correction, not a navigation, and must not cost a history
    // entry. A bare URL with no fragment counts: it names the home screen.
    const decoded = stateFromHash(current);
    const isCorrection =
      decoded.activePath === activePath &&
      (decoded.exploreTab === null || decoded.exploreTab === exploreTab);
    written.current = next;
    if (isCorrection) {
      window.history.replaceState(null, "", next);
    } else {
      window.location.hash = next;
    }
  }, [activePath, exploreTab]);

  // Back, Forward, and a link pasted into the same tab.
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash;
      if (sameAddress(hash, written.current)) return;
      // Every address this app mints starts with "#/". Anything else is an
      // in-page fragment (a skip link's "#main", a heading anchor's "#slug"),
      // and reading it as a route sent the reader Home with the fragment
      // erased. The bare "#" and "" still mean home.
      if (hash !== "" && hash !== "#" && !hash.startsWith("#/")) return;
      written.current = hash;
      const next = stateFromHash(hash);
      onNavigate(next.activePath, next.exploreTab);
      // If that navigation is a no-op, because the address decodes to the
      // screen the app is already on, React bails out and the write effect
      // never re-runs. Without this the address and the screen would disagree
      // for as long as the reader stayed, and the address they could copy back
      // out of the bar would be the broken one.
      const canonical = hashFor(next.activePath, next.exploreTab ?? exploreTab);
      if (!sameAddress(hash, canonical)) {
        written.current = canonical;
        window.history.replaceState(null, "", canonical);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [onNavigate, exploreTab]);
}
