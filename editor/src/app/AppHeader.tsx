// The top bar: a <header> landmark, the skip link first in tab order, the
// title as text (the page's own title is the h1), and the one live region.
//
// Extracted from App so it can be mounted in a test: App builds its own
// Octokit from the session, so the page-level assertions on landmarks and
// headings had nowhere to run before this existed.
import type { ReactNode } from "react";
import { Badge, Box, Button, Flex, IconButton, Text, Tooltip } from "@radix-ui/themes";
import type { SaveState } from "../drafts/useSaveState";
import { SaveStateIndicator } from "./SaveStateIndicator";
import { LiveRegion } from "./LiveRegion";

export interface AppHeaderProps {
  /** The global search, when there is a session; App owns its index. */
  search?: ReactNode;
  /** The freshness chip, when there is a session; App owns its Octokit. */
  freshness?: ReactNode;
  saveState: SaveState;
  /** The file `saveState` is about; see SaveStateIndicator. */
  savePath?: string | null;
  /** The Submissions button, when there is a session. */
  submissions?: { failing: boolean; onOpen: () => void } | null;
  batchCount: number;
  /** Whether a <main id="main"> is on the page. Signed out, there is none. */
  mainPresent: boolean;
  onOpenStaging: () => void;
  onOpenSettings: () => void;
}

export function AppHeader({
  search,
  freshness,
  saveState,
  savePath = null,
  submissions,
  batchCount,
  mainPresent,
  onOpenStaging,
  onOpenSettings,
}: AppHeaderProps) {
  return (
    <Flex
      asChild
      align="center"
      px="4"
      py="2"
      style={{ borderBottom: "1px solid var(--gray-5)", flexShrink: 0 }}
    >
      <header>
        {/* First focusable thing on the page: the way past a 54-item sidebar
            for a keyboard or screen-reader user. Visible only on focus, and
            only when there is a main to reach (signed out, there is none). */}
        {mainPresent && (
          <a
            href="#main"
            className="skip-link"
            onClick={(e) => {
              // The editor routes on the hash. Letting this link navigate
              // would fire hashchange with `#main`, an address the router
              // never minted, and land the reader on Home. Focus moves; the
              // address stays. The href is kept so assistive technology still
              // lists it as a same-page link.
              e.preventDefault();
              document.getElementById("main")?.focus();
            }}
          >
            Skip to content
          </a>
        )}
        <Flex align="center" gap="2" flexShrink="0">
          <img
            src="/actian-ds-knowledge/editor/favicon.svg"
            width="20"
            height="20"
            alt=""
            style={{ display: "block" }}
          />
          {/* Text, not Heading: Radix Heading defaults to h1, and this title
              was the first of nine h1s on every page (#653). */}
          <Text size="4" weight="bold">
            Actian DS Knowledge Editor
          </Text>
        </Flex>
        {/* Spacer: flexGrow pins the right-side actions even when signed out
            (no search rendered). GlobalSearch owns its own maxWidth/margin
            centering, so this wrapper stays unstyled. */}
        <Box flexGrow="1">{search}</Box>
        <Flex align="center" gap="3" flexShrink="0">
          {freshness}
          <SaveStateIndicator state={saveState} path={savePath} />
          <LiveRegion />
          {submissions && (
            <Button
              size="1"
              variant="soft"
              color={submissions.failing ? "amber" : "gray"}
              onClick={submissions.onOpen}
              title="My recent submissions + CI status"
            >
              Submissions
              {submissions.failing && (
                <Badge color="amber" radius="full" size="1">
                  !
                </Badge>
              )}
            </Button>
          )}
          {batchCount > 0 && (
            <Button size="1" variant="soft" color="indigo" onClick={onOpenStaging}>
              <span aria-hidden="true">📋</span>
              Batch
              <Badge color="indigo" radius="full" size="1">
                {batchCount}
              </Badge>
            </Button>
          )}
          <Tooltip content="Settings">
            <IconButton
              variant="ghost"
              onClick={onOpenSettings}
              aria-label="Open settings"
            >
              <GearIcon />
            </IconButton>
          </Tooltip>
        </Flex>
      </header>
    </Flex>
  );
}

function GearIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
