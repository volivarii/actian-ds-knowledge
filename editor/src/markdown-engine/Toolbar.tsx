// Markdown-syntax insertion toolbar — pure text mutation via CM6
// transactions. No parsing round-trip, no document-model conversion.

import { Button, Flex, Separator, Tooltip } from "@radix-ui/themes";
import type { EditorView } from "@codemirror/view";
import type { Octokit } from "@octokit/rest";
import { MediaPickerPopover } from "./MediaPickerPopover";
import { deriveUniqueSlug } from "./anchorSlug";
import { scanAnchors } from "./anchorScan";

export interface ToolbarProps {
  view: EditorView;
  /** Present only when editing a component-guideline .md (enables media). */
  octokit?: Octokit;
  componentSlug?: string | null;
}

function wrapSelection(view: EditorView, prefix: string, suffix: string) {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: {
      from,
      to,
      insert: prefix + view.state.sliceDoc(from, to) + suffix,
    },
    selection: { anchor: from + prefix.length, head: to + prefix.length },
  });
  view.focus();
}

function prefixLine(view: EditorView, prefix: string) {
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.from);
  view.dispatch({
    changes: { from: line.from, to: line.from, insert: prefix },
  });
  view.focus();
}

function insertAtCursor(view: EditorView, insert: string) {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
  });
  view.focus();
}

function insertAnchor(view: EditorView) {
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.from);
  const text = line.text;
  // Heading anchors only (Slice 1), matching the rich-mode command. Inert on a
  // non-heading line and on a heading that already ends in an anchor.
  const headingMatch = text.match(/^(#{1,6})\s+(.+)$/);
  if (!headingMatch || !headingMatch[2]) return;
  if (/\{#[a-z][a-z0-9-]*\}\s*$/.test(text)) return;
  // scanAnchors is grammar-agnostic and strips fenced/inline code, so the
  // uniqueness set covers every real {#slug} in the file.
  const slug = deriveUniqueSlug(
    headingMatch[2],
    scanAnchors(view.state.doc.toString()),
  );
  view.dispatch({
    changes: { from: line.to, to: line.to, insert: ` {#${slug}}` },
  });
  view.focus();
}

function insertTable(view: EditorView) {
  // Insert a minimal 2x2 markdown table at the cursor position, preceded
  // by a blank line so it parses correctly when inserted mid-paragraph.
  const insert = "\n| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |\n";
  insertAtCursor(view, insert);
}

// Shared button defaults: soft variant gives a visible but quiet
// surface (vs ghost which is fully transparent); size 2 with slightly
// more padding feels grounded without being heavy.
const BTN_SIZE = "2" as const;
const BTN_VARIANT = "soft" as const;

export function Toolbar({ view, octokit, componentSlug }: ToolbarProps) {
  return (
    <Flex className="md-toolbar" align="center" gap="3">
      {/* Group: Block-level */}
      <Flex gap="1" align="center">
        <Tooltip content="Heading 2">
          <Button
            size={BTN_SIZE}
            variant={BTN_VARIANT}
            aria-label="Heading 2"
            onClick={() => prefixLine(view, "## ")}
          >
            H2
          </Button>
        </Tooltip>
        <Tooltip content="Heading 3">
          <Button
            size={BTN_SIZE}
            variant={BTN_VARIANT}
            aria-label="Heading 3"
            onClick={() => prefixLine(view, "### ")}
          >
            H3
          </Button>
        </Tooltip>
        <Tooltip content="Bullet list">
          <Button
            size={BTN_SIZE}
            variant={BTN_VARIANT}
            aria-label="Bullet list"
            onClick={() => prefixLine(view, "- ")}
          >
            •
          </Button>
        </Tooltip>
        <Tooltip content="Numbered list">
          <Button
            size={BTN_SIZE}
            variant={BTN_VARIANT}
            aria-label="Numbered list"
            onClick={() => prefixLine(view, "1. ")}
          >
            1.
          </Button>
        </Tooltip>
        <Tooltip content="Blockquote">
          <Button
            size={BTN_SIZE}
            variant={BTN_VARIANT}
            aria-label="Blockquote"
            onClick={() => prefixLine(view, "> ")}
          >
            ❝
          </Button>
        </Tooltip>
      </Flex>

      <Separator orientation="vertical" size="1" />

      {/* Group: Inline */}
      <Flex gap="1" align="center">
        <Tooltip content="Bold (Cmd+B)">
          <Button
            size={BTN_SIZE}
            variant={BTN_VARIANT}
            aria-label="Bold"
            onClick={() => wrapSelection(view, "**", "**")}
          >
            <strong>B</strong>
          </Button>
        </Tooltip>
        <Tooltip content="Italic (Cmd+I)">
          <Button
            size={BTN_SIZE}
            variant={BTN_VARIANT}
            aria-label="Italic"
            onClick={() => wrapSelection(view, "*", "*")}
          >
            <em>I</em>
          </Button>
        </Tooltip>
        <Tooltip content="Link">
          <Button
            size={BTN_SIZE}
            variant={BTN_VARIANT}
            aria-label="Insert link"
            onClick={() => wrapSelection(view, "[", "](https://)")}
          >
            link
          </Button>
        </Tooltip>
      </Flex>

      <Separator orientation="vertical" size="1" />

      {/* Group: Insert */}
      <Flex gap="1" align="center">
        <Tooltip content="Code block">
          <Button
            size={BTN_SIZE}
            variant={BTN_VARIANT}
            aria-label="Code block"
            onClick={() => insertAtCursor(view, "\n```\n\n```\n")}
          >
            {"```"}
          </Button>
        </Tooltip>
        <Tooltip content="Table">
          <Button
            size={BTN_SIZE}
            variant={BTN_VARIANT}
            aria-label="Insert table"
            onClick={() => insertTable(view)}
          >
            table
          </Button>
        </Tooltip>
        {octokit && componentSlug && (
          <MediaPickerPopover
            octokit={octokit}
            componentSlug={componentSlug}
            onInsert={(snippet) => insertAtCursor(view, snippet)}
          />
        )}
        <Tooltip content="Add a section anchor to this heading">
          <Button
            size={BTN_SIZE}
            variant={BTN_VARIANT}
            aria-label="Insert anchor"
            onClick={() => insertAnchor(view)}
          >
            {"{#…}"}
          </Button>
        </Tooltip>
      </Flex>
    </Flex>
  );
}
