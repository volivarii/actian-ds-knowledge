import React from "react";
import { Box, Flex, Heading, Popover, Text } from "@radix-ui/themes";
import { findReferences, findDefinitions } from "../lib/anchorIndex";

export interface AnchorReferencesPopoverProps {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (path: string) => void;
  /** Element the popover anchors to. */
  trigger?: React.ReactNode;
}

export function AnchorReferencesPopover({
  slug,
  open,
  onOpenChange,
  onNavigate,
  trigger,
}: AnchorReferencesPopoverProps) {
  const refs = findReferences(slug);
  const defs = findDefinitions(slug);
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Popover.Trigger>{trigger}</Popover.Trigger>}
      <Popover.Content size="2">
        <Flex direction="column" gap="2">
          <Heading size="2">{`#${slug}`}</Heading>
          {defs.length > 0 && (
            <Text size="1" color="gray">
              defined in {defs.join(", ")}
            </Text>
          )}
          <Heading size="1">
            {refs.length === 0
              ? "No references in the substrate."
              : `Referenced by ${refs.length} file${refs.length === 1 ? "" : "s"}`}
          </Heading>
          {refs.length > 0 && (
            <Box>
              {refs.map((path) => (
                <Box
                  key={path}
                  py="1"
                  px="2"
                  style={{ cursor: "pointer" }}
                  onClick={() => onNavigate(path)}
                >
                  <Text size="2">{path}</Text>
                </Box>
              ))}
            </Box>
          )}
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
}
