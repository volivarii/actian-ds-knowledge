import { useState } from "react";
import {
  Box,
  Button,
  Callout,
  Flex,
  Heading,
  Popover,
  Text,
  TextField,
} from "@radix-ui/themes";

const SLUG_RE = /^[a-z][a-z0-9-]*$/;

export interface AnchorRenamePopoverProps {
  /** The anchor being renamed. */
  slug: string;
  /** Every OTHER anchor slug in this file; the new slug must not collide. */
  otherSlugs: string[];
  /** How many same-file `](#slug)` links will be auto-rewritten. */
  sameFileCount: number;
  /** Non-dist source files that reference this anchor and will NOT be
   *  auto-updated (the honest disclosure list). */
  crossFileReferrers: string[];
  /** DOM element the popover anchors to (the clicked chip or toolbar button). */
  triggerEl: HTMLElement;
  onRename: (newSlug: string) => void;
  onOpenChange: (open: boolean) => void;
}

/** Rename a heading anchor: validate the new slug, disclose which same-file
 *  links get auto-rewritten and which cross-file referrers will not, then hand
 *  the confirmed slug back to the caller. Modeled on AnchorReferencesPopover's
 *  triggerEl anchoring; the rename itself is applied by MarkdownEditScreen. */
export function AnchorRenamePopover({
  slug,
  otherSlugs,
  sameFileCount,
  crossFileReferrers,
  triggerEl,
  onRename,
  onOpenChange,
}: AnchorRenamePopoverProps) {
  const [value, setValue] = useState(slug);
  const rect = triggerEl.getBoundingClientRect();

  const trimmed = value.trim();
  const shapeOk = SLUG_RE.test(trimmed);
  const collides = otherSlugs.includes(trimmed);
  const unchanged = trimmed === slug;
  const valid = shapeOk && !unchanged && !collides;

  return (
    <Popover.Root open onOpenChange={onOpenChange}>
      <Popover.Anchor>
        <span
          aria-hidden="true"
          style={{
            position: "fixed",
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            pointerEvents: "none",
          }}
        />
      </Popover.Anchor>
      <Popover.Content size="2" style={{ maxWidth: 340 }}>
        <Flex direction="column" gap="2">
          <Heading size="2">{`Rename #${slug}`}</Heading>
          <label>
            <Text as="div" size="1" mb="1" color="gray">
              New anchor slug
            </Text>
            <TextField.Root
              autoFocus
              aria-label="New anchor slug"
              value={value}
              onChange={(e) => setValue(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid) onRename(trimmed);
              }}
            />
          </label>
          {trimmed.length > 0 && !shapeOk && (
            <Text size="1" color="red">
              Lowercase letters, digits, and hyphens only; must start with a
              letter.
            </Text>
          )}
          {shapeOk && collides && (
            <Text size="1" color="red">
              Another anchor in this file already uses that slug.
            </Text>
          )}
          <Text size="1" color="gray">
            {`${sameFileCount} link${sameFileCount === 1 ? "" : "s"} in this file will be updated.`}
          </Text>
          {crossFileReferrers.length > 0 && (
            <Callout.Root color="amber" size="1">
              <Callout.Text>
                <Text as="div" size="1">
                  {`${crossFileReferrers.length} other file${crossFileReferrers.length === 1 ? "" : "s"} reference${crossFileReferrers.length === 1 ? "s" : ""} this anchor and will not be auto-updated:`}
                </Text>
                <Box mt="1">
                  {crossFileReferrers.map((p) => (
                    <Text as="div" key={p} size="1">
                      {p}
                    </Text>
                  ))}
                </Box>
                <Text as="div" size="1" mt="1">
                  The submit-time anchor check still warns if a contract
                  disappears; external links (docs, MCP) are yours to update.
                </Text>
              </Callout.Text>
            </Callout.Root>
          )}
          <Flex gap="2" justify="end" mt="1">
            <Button
              variant="soft"
              color="gray"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button disabled={!valid} onClick={() => onRename(trimmed)}>
              Rename
            </Button>
          </Flex>
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
}
