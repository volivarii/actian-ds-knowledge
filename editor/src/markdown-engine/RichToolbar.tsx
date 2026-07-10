// Guard-safe formatting toolbar for Milkdown rich mode. Every button dispatches
// a built-in Milkdown command, and the SINGLE `COMMANDS` list below is the only
// source of both the rendered buttons and the guard test
// (rich-toolbar-commands.test.ts), which drives each command for real and
// asserts its serialized output round-trips guard-safe. A button cannot exist
// without a test driving it.

import React from "react";
import { Button, Flex, Separator, Tooltip } from "@radix-ui/themes";
import type { Octokit } from "@octokit/rest";
import { useInstance } from "@milkdown/react";
import { callCommand, insert, type $Command } from "@milkdown/utils";
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleLinkCommand,
  wrapInHeadingCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  createCodeBlockCommand,
} from "@milkdown/preset-commonmark";
import {
  insertTableCommand,
  addRowAfterCommand,
  addColAfterCommand,
  deleteSelectedCellsCommand,
} from "@milkdown/preset-gfm";
import { MediaPickerPopover } from "./MediaPickerPopover";

/** TEST-ONLY: the selection the guard test installs before running a command.
 *  The live toolbar always runs against the user's real selection. */
export type ToolbarSeedSelection = "all" | "table-cell" | "cell";

/** Button groups, rendered in this order and divided by a vertical separator. */
export type ToolbarGroup = "block" | "inline" | "insert";

export interface ToolbarCommand {
  /** Stable id; also the guard-test case name. */
  id: string;
  /** Visible button content. */
  glyph: React.ReactNode;
  /** Accessible name (also the tooltip text). */
  ariaLabel: string;
  group: ToolbarGroup;
  /** The Milkdown command slice this button dispatches. Payload types differ
   *  across commands, so the list is heterogeneous (`$Command<any>`). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  command: $Command<any>;
  /** Payload for callCommand: heading level, table dims, or link href. */
  payload?: unknown;
  /** TEST-ONLY: markdown the guard test applies this command to. */
  seed: string;
  /** TEST-ONLY: selection the guard test installs before running the command. */
  select: ToolbarSeedSelection;
}

// A 2-body-row GFM table seeds the contextual table ops so the guard test can
// place a cursor / cell-selection inside a real table, and so delete-cell
// (which removes a whole row) still leaves a valid table behind.
const TABLE_SEED = "| A | B |\n| --- | --- |\n| c | d |\n| e | f |\n";

/** SINGLE source of truth: the component maps over this to render buttons, and
 *  the guard test iterates it to drive every command for real. */
export const COMMANDS: readonly ToolbarCommand[] = [
  // Block-level
  {
    id: "h2",
    glyph: "H2",
    ariaLabel: "Heading 2",
    group: "block",
    command: wrapInHeadingCommand,
    payload: 2,
    seed: "Heading\n",
    select: "all",
  },
  {
    id: "h3",
    glyph: "H3",
    ariaLabel: "Heading 3",
    group: "block",
    command: wrapInHeadingCommand,
    payload: 3,
    seed: "Heading\n",
    select: "all",
  },
  {
    id: "bullet",
    glyph: "•",
    ariaLabel: "Bullet list",
    group: "block",
    command: wrapInBulletListCommand,
    seed: "one\n\ntwo\n",
    select: "all",
  },
  {
    id: "ordered",
    glyph: "1.",
    ariaLabel: "Numbered list",
    group: "block",
    command: wrapInOrderedListCommand,
    seed: "one\n\ntwo\n",
    select: "all",
  },
  {
    id: "quote",
    glyph: "❝",
    ariaLabel: "Blockquote",
    group: "block",
    command: wrapInBlockquoteCommand,
    seed: "quote\n",
    select: "all",
  },
  // Inline
  {
    id: "bold",
    glyph: <strong>B</strong>,
    ariaLabel: "Bold",
    group: "inline",
    command: toggleStrongCommand,
    seed: "bold\n",
    select: "all",
  },
  {
    id: "italic",
    glyph: <em>I</em>,
    ariaLabel: "Italic",
    group: "inline",
    command: toggleEmphasisCommand,
    seed: "italic\n",
    select: "all",
  },
  {
    id: "link",
    glyph: "link",
    ariaLabel: "Insert link",
    group: "inline",
    command: toggleLinkCommand,
    // Placeholder href, mirroring the source toolbar's `[text](https://)`; the
    // user edits the URL. A completed link `[text](https://…)` round-trips.
    payload: { href: "https://" },
    seed: "link\n",
    select: "all",
  },
  // Insert
  {
    id: "code",
    glyph: "```",
    ariaLabel: "Code block",
    group: "insert",
    command: createCodeBlockCommand,
    seed: "code\n",
    select: "all",
  },
  {
    id: "table",
    glyph: "table",
    ariaLabel: "Insert table",
    group: "insert",
    command: insertTableCommand,
    payload: { row: 2, col: 2 },
    seed: "seed\n",
    select: "all",
  },
  {
    id: "addRow",
    glyph: "+row",
    ariaLabel: "Add row",
    group: "insert",
    command: addRowAfterCommand,
    seed: TABLE_SEED,
    select: "table-cell",
  },
  {
    id: "addCol",
    glyph: "+col",
    ariaLabel: "Add column",
    group: "insert",
    command: addColAfterCommand,
    seed: TABLE_SEED,
    select: "table-cell",
  },
  {
    id: "deleteCell",
    glyph: "−cell",
    ariaLabel: "Delete selected cells",
    group: "insert",
    command: deleteSelectedCellsCommand,
    seed: TABLE_SEED,
    select: "cell",
  },
];

const GROUP_ORDER: readonly ToolbarGroup[] = ["block", "inline", "insert"];
// Match the source-mode Toolbar's button sizing/variant for visual parity.
const BTN_SIZE = "2" as const;
const BTN_VARIANT = "soft" as const;

export interface RichToolbarProps {
  /** Present only for component-guideline edits (enables the media picker). */
  octokit?: Octokit;
  componentSlug?: string | null;
}

export function RichToolbar({ octokit, componentSlug }: RichToolbarProps) {
  const [loading, get] = useInstance();
  const run = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    command: $Command<any>,
    payload?: unknown,
  ) => {
    if (loading) return;
    get().action(callCommand(command.key, payload));
  };
  return (
    <Flex className="md-toolbar" align="center" gap="3" mb="1">
      {GROUP_ORDER.map((group, i) => (
        <React.Fragment key={group}>
          {i > 0 && <Separator orientation="vertical" size="1" />}
          <Flex gap="1" align="center">
            {COMMANDS.filter((c) => c.group === group).map((c) => (
              <Tooltip key={c.id} content={c.ariaLabel}>
                <Button
                  size={BTN_SIZE}
                  variant={BTN_VARIANT}
                  aria-label={c.ariaLabel}
                  onClick={() => run(c.command, c.payload)}
                >
                  {c.glyph}
                </Button>
              </Tooltip>
            ))}
            {/* Media insertion needs the octokit-backed picker popover, so it
                lives here as an explicit Insert-group control rather than in the
                mapped COMMANDS list (which only holds single-dispatch commands).
                It still inserts a guard-safe <Media …/> directive. */}
            {group === "insert" && octokit && componentSlug && (
              <MediaPickerPopover
                octokit={octokit}
                componentSlug={componentSlug}
                onInsert={(snippet) => {
                  if (loading) return;
                  get().action(insert(snippet));
                }}
              />
            )}
          </Flex>
        </React.Fragment>
      ))}
    </Flex>
  );
}
