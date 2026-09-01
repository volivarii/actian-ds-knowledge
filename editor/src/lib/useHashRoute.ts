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
 * Keeps the URL hash and the editor's navigation state in step, in both
 * directions, and names the page in the tab title.
 *
 * `window.location.hash = ...` rather than `history.pushState` on purpose: the
 * assignment pushes its own history entry, so Back and Forward work without the
 * hook owning a history stack of its own. The one exception is a bare URL with
 * no fragment at all, which is normalised with `replaceState` so that arriving
 * at the editor does not spend a history entry on it.
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
  /** The address this hook last wrote. A `hashchange` matching it is our own
   *  echo, not a reader asking to go somewhere. */
  const written = useRef<string | null>(null);

  // Write the address when the app navigates.
  useEffect(() => {
    const next = hashFor(activePath, exploreTab);
    document.title = titleFor(activePath);
    const current = window.location.hash;
    if (current === next) return;
    written.current = next;
    if (current === "") {
      // Arriving at the bare URL. Normalise without pushing, so the reader's
      // first Back leaves the editor rather than going to the same screen.
      window.history.replaceState(null, "", next);
    } else {
      window.location.hash = next;
    }
  }, [activePath, exploreTab]);

  // Back, Forward, and a link pasted into the same tab.
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash;
      if (hash === written.current) return;
      written.current = hash;
      const next = stateFromHash(hash);
      onNavigate(next.activePath, next.exploreTab);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [onNavigate]);
}
