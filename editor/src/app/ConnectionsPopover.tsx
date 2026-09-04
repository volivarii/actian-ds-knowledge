// Right-rail popover anchored to an Outline section pill. Hosts two
// modes: the SectionInspector (default) showing current connections, and
// the TopicPicker for adding / repointing a connection.
//
// v1.2 write-back: pick / disconnect / repoint mutate the file source via
// the pure rewriter helpers and notify the parent through onTextChange.
// The parent (MarkdownEditScreen) dispatches the new text through the
// CodeMirror view so the editor + draft autosave stay in sync.

import React, { useState } from "react";
import { Box, Button, Callout, Flex, Popover, Text } from "@radix-ui/themes";
import { SectionInspector } from "./SectionInspector";
import { TopicPicker } from "./TopicPicker";
import type { PickedTopic } from "./TopicPicker";
import type {
  AnyRefField,
  BrokenRef,
  Consumer,
  Domain,
  OutgoingConnection,
  Taxonomy,
} from "../substrate";
import { FrontmatterRefStore, refFieldFor } from "../substrate/refStore";
import { nodeIdForFile } from "../substrate/nodeIdForFile";

// Derive which topic domains are valid targets for the picker based on
// the file being edited. Returns undefined (= all domains) when the path
// doesn't match a known restrictive pattern.
//
// Mapping rationale (mirrors the write-back field mapping):
//   components/src/categories/ → a11y + motion + foundations (supports
//     a11y_refs, motion_refs, AND foundations_refs frontmatter fields)
//   content/src/ → component only (content files cross-reference DS
//     components via the relatedComponents flat-array field)
//   foundations/src/ | accessibility/src/ | motion/ → a11y + motion only
//     (those domain files cross-reference within a11y+motion, not foundations)
//   All other paths → a11y + motion (the conservative default: every domain
//     file supports the object-ref fields, and this avoids offering flat
//     relatedComponents on a file whose schema doesn't support it).
function allowedDomainsFor(filePath: string | undefined): Domain[] {
  if (!filePath) return ["accessibility", "motion"];
  if (filePath.startsWith("components/src/categories/")) {
    return ["accessibility", "motion", "foundations"];
  }
  if (filePath.startsWith("content/src/")) {
    return ["component"];
  }
  if (
    filePath.startsWith("foundations/src/") ||
    filePath.startsWith("accessibility/src/") ||
    filePath.startsWith("motion/")
  ) {
    return ["accessibility", "motion"];
  }
  return ["accessibility", "motion"];
}

export interface ConnectionsPopoverProps {
  sectionTitle: string;
  text: string;
  outgoing: OutgoingConnection[];
  incoming: Consumer[];
  broken?: BrokenRef[];
  taxonomy: Taxonomy;
  /** P8 Option A: file-level outgoing attaches to the file's top H2.
   *  When `"file"` the inspector shows + manages outgoing; when
   *  `"section"` it's a read-only incoming view. */
  scope: "file" | "section";
  /** The path of the file being edited. Used to determine which topic
   *  domains the picker offers (category files add foundations_refs;
   *  a11y/foundations/motion section files offer a11y+motion only). */
  filePath?: string;
  onTextChange: (next: string) => void;
  onClose: () => void;
  /** DOM element the popover anchors to. The Outline pill the author
   *  clicked; positioned via an invisible fixed-rect <Popover.Anchor> so
   *  Radix's floating layout has something concrete to attach to even
   *  when the trigger lives in a different React subtree. */
  anchorEl: HTMLElement | null;
  /** Navigate to another file/workspace (e.g. clicking a referrer in the
   *  Referenced-by panel). The popover closes before navigating. */
  onNavigate?: (path: string) => void;
}

export function ConnectionsPopover(props: ConnectionsPopoverProps) {
  const {
    sectionTitle,
    text,
    outgoing,
    incoming,
    broken = [],
    taxonomy,
    scope,
    filePath,
    onTextChange,
    onClose,
    anchorEl,
    onNavigate,
  } = props;

  const allowedDomains = allowedDomainsFor(filePath);
  const nodeId = nodeIdForFile(filePath);

  // Two views inside the popover: the Inspector (default) and the Topic
  // Picker (opened by + Connect or Repoint).
  const [mode, setMode] = useState<"inspector" | "picker">("inspector");
  // Atomic-swap state: when the author clicks "Repoint…", remember which
  // (refType, slug) to remove on the next successful pick. On cancel, the
  // value is cleared and the source stays untouched.
  const [repointing, setRepointing] = useState<{
    refType: AnyRefField;
    slug: string;
  } | null>(null);

  const rect = anchorEl?.getBoundingClientRect();

  function applyPick(pick: PickedTopic) {
    const newField = refFieldFor(pick.domain);
    let next = text;
    if (repointing) {
      const store = new FrontmatterRefStore(next);
      next = store.removeRef(repointing.refType, repointing.slug);
    }
    const store = new FrontmatterRefStore(next);
    next = store.addRef(newField, pick.slug, pick.note);
    onTextChange(next);
    setRepointing(null);
    setMode("inspector");
  }

  function applyRemove(refType: AnyRefField, slug: string) {
    const store = new FrontmatterRefStore(text);
    onTextChange(store.removeRef(refType, slug));
  }

  return (
    <Popover.Root
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Popover.Anchor>
        <span
          aria-hidden="true"
          style={{
            position: "fixed",
            left: rect?.left ?? 0,
            top: rect?.top ?? 0,
            width: rect?.width ?? 0,
            height: rect?.height ?? 0,
            pointerEvents: "none",
          }}
        />
      </Popover.Anchor>
      <Popover.Content
        size="2"
        side="bottom"
        align="start"
        sideOffset={6}
        collisionPadding={12}
        data-testid="connections-popover"
        style={{ width: 300, maxHeight: "70vh", overflow: "auto" }}
      >
        {mode === "inspector" ? (
          <SectionInspector
            sectionTitle={sectionTitle}
            outgoing={outgoing}
            incoming={incoming}
            broken={broken}
            taxonomy={taxonomy}
            scope={scope}
            nodeId={nodeId}
            onNavigate={
              onNavigate
                ? (p) => {
                    onClose();
                    onNavigate(p);
                  }
                : undefined
            }
            onAddConnection={() => {
              setRepointing(null);
              setMode("picker");
            }}
            onRemoveConnection={(refType, slug) => {
              applyRemove(refType, slug);
            }}
            onRepointConnection={(refType, slug) => {
              setRepointing({ refType, slug });
              setMode("picker");
            }}
          />
        ) : (
          <Box>
            <Flex align="center" justify="between" mb="2">
              <Text size="1" color="gray" weight="medium">
                {repointing
                  ? `Repoint "${sectionTitle}"`
                  : `Connect "${sectionTitle}" to a topic`}
              </Text>
              <Button
                size="1"
                variant="ghost"
                onClick={() => {
                  setRepointing(null);
                  setMode("inspector");
                }}
              >
                ← back
              </Button>
            </Flex>
            {repointing ? (
              <Callout.Root color="amber" size="1" mb="2" role="status">
                <Callout.Text>
                  Pick a replacement topic. The current connection will be
                  swapped atomically.
                </Callout.Text>
              </Callout.Root>
            ) : null}
            <TopicPicker
              taxonomy={taxonomy}
              allowedDomains={allowedDomains}
              onPick={applyPick}
              onCancel={() => {
                setRepointing(null);
                setMode("inspector");
              }}
            />
          </Box>
        )}
      </Popover.Content>
    </Popover.Root>
  );
}
