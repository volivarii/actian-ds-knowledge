// The rail beside the body editor: the document's outline. A record's links
// live in its Connections section (app/connections), the one place that
// counts and edits them, so the rail lists none. Mode
// agnostic: parents supply navigation, so the same rail serves CodeMirror
// source mode, Milkdown rich mode, and the frontmatter-form body view.
import React, { useMemo } from "react";
import { Box, Button, Flex, Text } from "@radix-ui/themes";
import type { Heading } from "../lib/headingScan";
import { sectionAnchors } from "../lib/referenceIndex";
import { onActivateKey } from "../lib/onActivateKey";

export interface RelationsPanelProps {
  text: string;
  /** Scroll the editor to this heading, at its index among the outline's
   *  H1-H3 headings (index-based so duplicate heading text and inline
   *  markdown in a heading don't break navigation). Mode-specific: CM6 line
   *  scroll in source mode, DOM heading scroll (by index) in rich mode. */
  onNavigate: (heading: Heading, index: number) => void;
  /** Collapsed state is owned by the parent screen so it persists per
   *  preference and can hide the rail's companions with it. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Section anchor the editor is currently focused on (cursor-derived in the
   *  CodeMirror modes), highlighted in the outline as a passive follow marker.
   *  Rich mode has no cursor callback yet, so it passes null. */
  activeAnchor?: string | null;
}

const COLLAPSE_STORAGE_KEY = "relationsPanelCollapsed";

/** Read the persisted collapsed preference. Owned here (not by the panel's
 *  own state) so the parents that now own `collapsed` can seed their
 *  initial state from the same key the toggle writes to. */
export function readRelationsPanelCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist the collapsed preference. Failures (e.g. private-mode storage)
 *  are swallowed: the caller's in-memory state still toggles for the
 *  session. */
export function writeRelationsPanelCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    /* storage unavailable: state still toggles for the session */
  }
}

export function RelationsPanel(props: RelationsPanelProps) {
  const { collapsed, onToggleCollapsed } = props;
  const entries = useMemo(() => sectionAnchors(props.text), [props.text]);
  return (
    <Flex
      direction="column"
      gap="2"
      p="2"
      style={{ height: "100%", overflow: "auto" }}
    >
      <Flex align="center" justify="between">
        <Text size="1" weight="bold" color="gray">
          Outline
        </Text>
        <Button
          size="1"
          variant="ghost"
          aria-label="Toggle relations panel"
          onClick={onToggleCollapsed}
        >
          {collapsed ? "«" : "»"}
        </Button>
      </Flex>
      {!collapsed && (
        <Box>
          {entries.map(({ heading: h, anchor }, i) => {
            const active =
              anchor !== null && anchor === (props.activeAnchor ?? null);
            const activate = () => props.onNavigate(h, i);
            return (
              <Flex
                key={`${h.line}:${i}`}
                data-testid="outline-row"
                data-active={active ? "true" : undefined}
                role="button"
                tabIndex={0}
                align="center"
                px="1"
                style={{
                  cursor: "pointer",
                  borderRadius: 4,
                  // Passive cursor-follow marker: an accent left rule, with a
                  // transparent rule as the baseline so activating a row never
                  // shifts its text sideways.
                  borderLeft: active
                    ? "2px solid var(--accent-8)"
                    : "2px solid transparent",
                  fontWeight: active ? 600 : undefined,
                  paddingLeft: (h.level - 1) * 10,
                }}
                onClick={activate}
                onKeyDown={onActivateKey(activate)}
              >
                <Text size="1" truncate>
                  {h.text}
                </Text>
              </Flex>
            );
          })}
        </Box>
      )}
    </Flex>
  );
}
