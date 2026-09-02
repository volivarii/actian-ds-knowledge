import { Window } from "happy-dom";
const win = new Window({ url: "http://localhost" });
const g = globalThis as unknown as Record<string, unknown>;

// Install DOM globals that ProseMirror / Milkdown require.
// Some (e.g. navigator on Node 22) are read-only getter-only properties on
// globalThis — fall back to Object.defineProperty for those.
//
// IMPORTANT: CustomEvent and Event must come from the happy-dom window so that
// Milkdown's Timer (which does `new CustomEvent(...); dispatchEvent(event)`)
// creates events that happy-dom's EventTarget accepts. Mixing native Node.js
// CustomEvent with happy-dom's dispatchEvent causes a type-check failure.
for (const k of [
  "window",
  "document",
  "navigator",
  "getSelection",
  "Range",
  "DocumentFragment",
  "Node",
  "Element",
  "HTMLElement",
  "customElements",
  "DOMParser",
  "MutationObserver",
  "Event",
  "CustomEvent",
]) {
  const v = (win as unknown as Record<string, unknown>)[k];
  if (v !== undefined) {
    try {
      g[k] = v;
    } catch {
      // Read-only getter-only globals (e.g. navigator on Node 22)
      Object.defineProperty(globalThis, k, {
        configurable: true,
        writable: true,
        value: v,
      });
    }
  }
}

// Event listener methods + animation frame stubs (Milkdown / ProseMirror need them)
g.addEventListener = win.addEventListener.bind(win);
g.removeEventListener = win.removeEventListener.bind(win);
g.dispatchEvent = win.dispatchEvent.bind(win);
g.requestAnimationFrame = (cb: FrameRequestCallback) =>
  setTimeout(() => cb(performance.now()), 0) as unknown as number;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);

// ProseMirror calls document.createRange() to place the cursor — happy-dom
// exposes it but the assignment above copies the document object; make sure
// createRange is wired on the installed document reference.
if (!(g.document as { createRange?: unknown }).createRange) {
  (g.document as { createRange: () => unknown }).createRange = () =>
    (win.document as unknown as { createRange: () => unknown }).createRange();
}

// Radix UI dialog/presence components call getComputedStyle when opening
// overlays. happy-dom provides it on win but not on globalThis by default.
if (!("getComputedStyle" in globalThis)) {
  g.getComputedStyle = (
    win as unknown as { getComputedStyle: unknown }
  ).getComputedStyle;
}

// happy-dom lacks Web Storage and the observers Radix widgets touch. One copy
// here, guarded, so screen tests under happy-dom need no local stubs.
for (const key of ["sessionStorage", "localStorage"] as const) {
  if (!(g as Record<string, unknown>)[key]) {
    const store: Record<string, string> = {};
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
        clear: () => {
          for (const k of Object.keys(store)) delete store[k];
        },
      },
    });
  }
}
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
for (const name of ["ResizeObserver", "IntersectionObserver"] as const) {
  if (!(g as Record<string, unknown>)[name]) (g as Record<string, unknown>)[name] = NoopObserver;
}
