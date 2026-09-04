// Header-bar badge surfacing draft-save state to the author.
//
// Three visible states (idle is hidden):
//   ● Unsaved changes    (warning amber, while a debounce timer pends)
//   ● Saving…            (neutral spinner, very briefly during the write)
//   ✓ Draft saved · …    (success green, with relative timestamp)
//
// Wording note: "Draft saved" — NOT "Saved". Removes ambiguity between
// local draft and remote commit. Authors who see "Saved" sometimes
// assume the file is pushed to GitHub; "Draft saved" makes the local
// scope explicit.

import { useEffect, useRef, useState } from "react";
import { Badge, Flex, Text } from "@radix-ui/themes";
import type { SaveState } from "../drafts/useSaveState";
import { announce } from "../lib/announcer";

export interface SaveStateIndicatorProps {
  state: SaveState;
  /**
   * How long "saving" may last before it is announced as a failure. The
   * store emits writing and saved in one synchronous pass, so a committed
   * "saving" state only ever means the write threw and "saved" never came.
   */
  failureAfterMs?: number;
}

/** A save is announced at most this often per mount; autosave writes at every
 *  typing pause, and "Draft saved" every second is noise, not news. */
const QUIET_MS = 60_000;

function relativeTime(ts: number, now: number): string {
  const diffSec = Math.floor((now - ts) / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function SaveStateIndicator({
  state,
  failureAfterMs = 3000,
}: SaveStateIndicatorProps) {
  // Tick every second so the relative timestamp re-renders.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (state.kind !== "saved") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    // unref() prevents the timer from keeping the Node.js event loop alive
    // in test environments — has no effect in browsers.
    if (typeof (id as unknown as { unref?: () => void }).unref === "function") {
      (id as unknown as { unref: () => void }).unref();
    }
    return () => clearInterval(id);
  }, [state.kind]);

  // The badge is visual only; the header's live region speaks (F20). Three
  // rules keep it from being noise: a save is announced only when it follows
  // a change in this session (opening a file that already has a draft starts
  // at "saved" with no write), at most once per QUIET_MS (autosave writes at
  // every typing pause), and a "saving" that never becomes "saved" is a
  // failed write and is said so.
  const previousKind = useRef(state.kind);
  const lastSpokenAt = useRef(0);
  useEffect(() => {
    const was = previousKind.current;
    previousKind.current = state.kind;
    if (state.kind === "saved" && was === "unsaved") {
      const now = Date.now();
      if (now - lastSpokenAt.current >= QUIET_MS) {
        lastSpokenAt.current = now;
        announce("Draft saved");
      }
    }
    if (state.kind !== "saving") return;
    const id = setTimeout(() => announce("Draft could not be saved"), failureAfterMs);
    return () => clearTimeout(id);
  }, [state.kind, failureAfterMs]);

  if (state.kind === "idle") return null;

  if (state.kind === "unsaved") {
    return (
      <Badge variant="soft" color="amber" radius="full">
        <Dot color="var(--zen-color-icon-warning, #EF8D00)" />
        <Text size="1">Unsaved changes</Text>
      </Badge>
    );
  }

  if (state.kind === "saving") {
    return (
      <Badge variant="soft" color="gray" radius="full">
        <Dot color="var(--zen-color-neutral-400, #9898A7)" pulsing />
        <Text size="1">Saving…</Text>
      </Badge>
    );
  }

  // saved
  return (
    <Badge variant="soft" color="green" radius="full">
      <Check color="var(--zen-color-icon-success, #098900)" />
      <Text size="1">Draft saved · {relativeTime(state.savedAt, now)}</Text>
    </Badge>
  );
}

function Dot({ color, pulsing }: { color: string; pulsing?: boolean }) {
  return (
    <Flex
      align="center"
      justify="center"
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        animation: pulsing ? "save-pulse 1s ease-in-out infinite" : undefined,
        marginRight: 6,
      }}
    />
  );
}

function Check({ color }: { color: string }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      style={{ marginRight: 6 }}
      aria-hidden="true"
    >
      <path
        d="M2.5 6.5L5 9L9.5 3.5"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
