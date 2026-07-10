// Caret-anchored popup for the `[[` reference autocomplete. Renders `null`
// when no trigger is open. Owns ALL keyboard nav (arrows/Enter/Escape) itself
// via a document-level capture-phase listener; see the header comment in
// referenceAutocomplete.ts for why capture-phase is required to beat
// ProseMirror's own keydown handling.
import React from "react";
import { Box, Card, Flex, Text, Badge } from "@radix-ui/themes";
import {
  searchReferenceTargets,
  type ReferenceTarget,
} from "../lib/referenceIndex";
import type { ReferencePickerState } from "./referenceAutocomplete";

export interface ReferencePickerProps {
  state: ReferencePickerState | null;
  /** Live body text, threaded the same way MilkdownBody's onChange freshness
   *  is handled in RichBodyEditor: a plain prop read fresh on every render,
   *  not a stale closure. searchReferenceTargets scores the CURRENT file's
   *  section anchors against it. */
  currentBodyText: string;
}

export function ReferencePicker({
  state,
  currentBodyText,
}: ReferencePickerProps) {
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const results: ReferenceTarget[] = React.useMemo(
    () => (state ? searchReferenceTargets(state.query, currentBodyText) : []),
    [state, currentBodyText],
  );

  // A new query (or the picker re-opening) always restarts the highlight at
  // the top result.
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [state?.query]);

  React.useEffect(() => {
    if (!state) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        state.close();
        return;
      }
      if (event.key === "ArrowDown" && results.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        setSelectedIndex((i) => (i + 1) % results.length);
        return;
      }
      if (event.key === "ArrowUp" && results.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        setSelectedIndex((i) => (i - 1 + results.length) % results.length);
        return;
      }
      if (event.key === "Enter" && results.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        const target = results[selectedIndex];
        if (target) state.apply(target);
      }
    };
    // capture: true (see the file header comment).
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [state, results, selectedIndex]);

  if (!state) return null;

  return (
    <Card
      size="1"
      style={{
        position: "fixed",
        left: state.rect.left,
        top: state.rect.bottom + 4,
        width: 320,
        maxHeight: 280,
        overflow: "auto",
        zIndex: 1000,
      }}
    >
      {results.length === 0 ? (
        <Box p="2">
          <Text size="1" color="gray">
            {state.query.length === 0
              ? "Type to search components and sections…"
              : `No matches for "${state.query}".`}
          </Text>
        </Box>
      ) : (
        <Flex direction="column" gap="1">
          {results.map((target, i) => (
            <Box
              key={`${target.kind}:${target.href}`}
              p="2"
              style={{
                borderRadius: 4,
                cursor: "pointer",
                background: i === selectedIndex ? "var(--accent-4)" : undefined,
              }}
              onMouseEnter={() => setSelectedIndex(i)}
              // onMouseDown (not onClick): fires before the editor blurs and
              // steals the selection, so `apply` still sees the tracked range.
              onMouseDown={(event) => {
                event.preventDefault();
                state.apply(target);
              }}
            >
              <Flex align="center" gap="2">
                <Text size="2" weight="medium">
                  {target.label}
                </Text>
                <Badge
                  size="1"
                  color={target.kind === "component" ? "blue" : "gray"}
                >
                  {target.kind}
                </Badge>
              </Flex>
              <Text size="1" color="gray">
                {target.detail}
              </Text>
            </Box>
          ))}
        </Flex>
      )}
    </Card>
  );
}
