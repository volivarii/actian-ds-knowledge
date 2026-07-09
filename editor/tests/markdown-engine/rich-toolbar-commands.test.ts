import "../setup-happy-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewCtx,
} from "@milkdown/core";
import { callCommand, getMarkdown } from "@milkdown/utils";
import {
  AllSelection,
  TextSelection,
  Selection,
  type EditorState,
} from "@milkdown/prose/state";
import { CellSelection } from "@milkdown/prose/tables";
import type { Node as ProseNode } from "@milkdown/prose/model";
import {
  useMilkdownPresets,
  roundTripMarkdown,
} from "../../src/markdown-engine/milkdownPreset";
import {
  COMMANDS,
  type ToolbarSeedSelection,
} from "../../src/markdown-engine/RichToolbar";

// CONTROLLER AMENDMENT: this test drives the toolbar's REAL Milkdown commands
// (the exact COMMANDS list the component renders) through the SHARED preset,
// then asserts each command's REAL serialized output is guard-safe. A hand
// written sample constant would leave a mis-wired button or bad payload green;
// driving the real command cannot.

// The round-trip guard allows exactly two inline-HTML forms. `<br>`: Milkdown
// serializes an empty GFM table cell as `<br />` (space and slash), which the
// tools for insert-table / add-row / add-col all produce; it round-trips
// idempotently. `<Media>`: the registered display-only directive. The `\s*`
// (vs the older `\/?` only) makes the negative lookahead recognize the spaced
// `<br />` the serializer actually emits — kept in lockstep with
// wysiwyg-safe-paths.test.ts.
const DISALLOWED_HTML = /<(?!br\b\s*\/?>|Media\b)[A-Za-z]/g;

/** Position immediately before the first table *body* cell in the doc, or -1. */
function findFirstBodyCellPos(doc: ProseNode): number {
  let pos = -1;
  doc.descendants((node, p) => {
    if (pos !== -1) return false;
    if (node.type.name === "table_cell") {
      pos = p;
      return false;
    }
    return true;
  });
  return pos;
}

/** The selection the command needs before it will act: select-all for inline
 *  marks / block wraps; a text cursor inside a cell for row/col adds
 *  (isInTable); a CellSelection for delete-selected-cells. */
function buildSelection(
  mode: ToolbarSeedSelection,
  state: EditorState,
): Selection {
  const { doc } = state;
  if (mode === "all") return new AllSelection(doc);
  const cellPos = findFirstBodyCellPos(doc);
  assert.notEqual(cellPos, -1, "table-context seed must contain a body cell");
  if (mode === "cell") return new CellSelection(doc.resolve(cellPos));
  // "table-cell": nearest text position inside the first body cell.
  return TextSelection.near(doc.resolve(cellPos + 1), 1);
}

/** Build a real editor with the SHARED preset (identical to the live editor and
 *  the round-trip guard), seed it, install the selection the command requires,
 *  run the toolbar's REAL command with its REAL payload, return the markdown. */
async function runToolbarCommand(
  cmd: (typeof COMMANDS)[number],
): Promise<string> {
  const root = globalThis.document.createElement("div");
  const editor = await useMilkdownPresets(
    Editor.make().config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, cmd.seed);
    }),
  ).create();
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    view.dispatch(
      view.state.tr.setSelection(buildSelection(cmd.select, view.state)),
    );
  });
  editor.action(callCommand(cmd.command.key, cmd.payload));
  const out = editor.action(getMarkdown());
  await editor.destroy();
  return out;
}

for (const cmd of COMMANDS) {
  test(`toolbar '${cmd.id}' produces guard-safe markdown`, async () => {
    const md = await runToolbarCommand(cmd);
    // A no-op means the button is mis-wired or the payload is wrong; fail loud.
    assert.notEqual(
      md,
      cmd.seed,
      `'${cmd.id}' command did not change the document (mis-wired button or bad payload)`,
    );
    const rt1 = await roundTripMarkdown(md);
    assert.equal(
      await roundTripMarkdown(rt1),
      rt1,
      "round-trip must be idempotent (RT2 === RT1)",
    );
    assert.ok(!/\{:/.test(rt1), "no Kramdown block IAL");
    // Code spans / fenced blocks hold literal text, not HTML — strip first.
    const htmlScan = rt1.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
    assert.equal(
      htmlScan.match(DISALLOWED_HTML),
      null,
      "no inline HTML except <br> and the <Media> directive",
    );
  });
}

// Guards against a vacuous pass: an empty (or duplicate-id) COMMANDS list would
// register no per-command tests, leaving the suite green while proving nothing.
test("COMMANDS is a non-empty list of uniquely-identified buttons", () => {
  assert.ok(COMMANDS.length > 0, "COMMANDS must not be empty");
  const ids = new Set(COMMANDS.map((c) => c.id));
  assert.equal(ids.size, COMMANDS.length, "command ids must be unique");
});
