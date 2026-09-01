import { useEffect, useRef } from "react";
import type { ExploreTab } from "../app/HomeScreen";
import {
  hashFor,
  pathFromHash,
  exploreTabFromHash,
  titleFor,
} from "./routes";

interface UseHashRouteArgs {
  activePath: string | null;
  exploreTab: ExploreTab;
  /** Called when the address, rather than the app, decides the screen: a deep
   *  link on first load, Back, Forward, or a link pasted into the same tab. */
  onNavigate: (path: string | null, tab: ExploreTab | null) => void;
}

/**
 * Keeps the URL hash and the editor's navigation state in step, in both
 * directions, and names the page in the tab title.
 *
 * `window.location.hash = ...` rather than `history.pushState` on purpose: the
 * assignment pushes its own history entry, so Back and Forward work without the
 * hook owning a history stack of its own.
 */
export function useHashRoute({
  activePath,
  exploreTab,
  onNavigate,
}: UseHashRouteArgs): void {
  /** The address this hook last wrote. A `hashchange` matching it is our own
   *  echo, not a reader asking to go somewhere. */
  const written = useRef<string | null>(null);
  /** False until the write effect has been offered its first run. */
  const hydrated = useRef(false);

  // Read the address once, on mount.
  useEffect(() => {
    const hash = window.location.hash;
    written.current = hash;
    const path = pathFromHash(hash);
    const tab = exploreTabFromHash(hash);
    if (path !== null || tab !== null) onNavigate(path, tab);
    // Mount only: re-reading the address on every render would fight the
    // write effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Write the address when the app navigates.
  useEffect(() => {
    // Skip the first run. It happens after the read effect above but before
    // the navigation that effect requested has re-rendered, so `activePath`
    // is still the initial null. Writing here would replace a deep link with
    // the home address before the deep link had a chance to apply.
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    const next = hashFor(activePath, exploreTab);
    document.title = titleFor(activePath);
    if (window.location.hash !== next) {
      written.current = next;
      window.location.hash = next;
    }
  }, [activePath, exploreTab]);

  // Back, Forward, and a link pasted into the same tab.
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash;
      if (hash === written.current) return;
      written.current = hash;
      onNavigate(pathFromHash(hash), exploreTabFromHash(hash));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [onNavigate]);
}
