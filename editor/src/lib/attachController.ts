import { useCallback, useRef } from "react";

// Attach DOM controllers (cross-surface highlight, hover card, ...) to a node
// via a CALLBACK REF: install on attach, tear down on detach.
//
// Why not a `useEffect(fn, [])` reading a `useRef`: when the target node renders
// behind a loading gate (e.g. MarkdownEditScreen shows a <Spinner/> until its
// GitHub fetch resolves, then mounts the real root), the effect runs once at the
// first commit when the ref is still null, bails, and never re-runs (empty
// deps). A callback ref instead fires exactly when the node attaches, and again
// (with null) when it detaches — so it survives the Spinner→ready transition and
// every file-switch remount.
export function useAttachController(
  install: (root: HTMLElement) => () => void,
): (node: HTMLElement | null) => void {
  // Latest-ref so the returned callback stays stable (never re-fires on render)
  // while `install` may be a fresh closure each render.
  const installRef = useRef(install);
  installRef.current = install;
  const teardown = useRef<(() => void) | null>(null);

  return useCallback((node: HTMLElement | null) => {
    if (teardown.current) {
      teardown.current();
      teardown.current = null;
    }
    if (node) teardown.current = installRef.current(node);
  }, []);
}
