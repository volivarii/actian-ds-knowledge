// Shared CodeMirror 6 theme for this app's editors.
//
// 🔑 The `{ dark: true }` second argument is the load-bearing part, not the
// colours. CM6 ships its base styles in `&light` / `&dark` variants and picks
// between them from THIS flag, not from the surrounding page. The app runs
// Radix `appearance="dark"`, so without the flag CM6 applied its light base
// theme and rendered lint tooltips and completion popups as near-white panels,
// while the Radix text colours around them resolved to near-white text. That
// is unreadable, and it cannot be fixed from a stylesheet: CM6 emits its base
// rules scoped by a generated class, which out-specifies a plain `.cm-tooltip`
// selector in base.css.
//
// Both editors share this so the two surfaces cannot drift apart again.

import { EditorView } from "@codemirror/view";

export const cmDarkSurface = EditorView.theme(
  {
    // Tooltip shell: lint messages, completion popups, and the YAML pane's
    // schema hover card all render inside this container.
    ".cm-tooltip": {
      background: "var(--gray-3)",
      border: "1px solid var(--gray-6)",
      borderRadius: "6px",
      color: "var(--gray-12)",
      boxShadow: "0 6px 20px rgb(0 0 0 / 45%)",
    },
    ".cm-tooltip .cm-tooltip-arrow:before": {
      borderTopColor: "var(--gray-6)",
      borderBottomColor: "var(--gray-6)",
    },
    ".cm-tooltip .cm-tooltip-arrow:after": {
      borderTopColor: "var(--gray-3)",
      borderBottomColor: "var(--gray-3)",
    },

    // Lint messages. Severity stays legible in the text colour rather than
    // relying on the gutter marker alone.
    ".cm-diagnostic": {
      padding: "6px 8px",
      borderLeftWidth: "4px",
      borderLeftStyle: "solid",
      fontFamily: "var(--zen-font-family-mono), ui-monospace, monospace",
      fontSize: "12px",
      lineHeight: "1.45",
    },
    ".cm-diagnostic-error": {
      borderLeftColor: "var(--red-9)",
      color: "var(--red-11)",
    },
    ".cm-diagnostic-warning": {
      borderLeftColor: "var(--amber-9)",
      color: "var(--amber-11)",
    },
    ".cm-diagnostic-info": {
      borderLeftColor: "var(--blue-9)",
      color: "var(--blue-11)",
    },

    // Completion popup: the YAML pane's schema completion and the markdown
    // editor's anchor completion.
    ".cm-tooltip-autocomplete > ul > li": {
      color: "var(--gray-12)",
      padding: "3px 8px",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      background: "var(--accent-9)",
      color: "var(--accent-contrast, #fff)",
    },
    ".cm-completionLabel": {
      fontFamily: "var(--zen-font-family-mono), ui-monospace, monospace",
    },
    ".cm-completionDetail": {
      color: "var(--gray-11)",
      fontStyle: "normal",
      marginLeft: "10px",
      fontSize: "11px",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionDetail": {
      color: "var(--accent-contrast, #fff)",
      opacity: "0.85",
    },
  },
  { dark: true },
);
