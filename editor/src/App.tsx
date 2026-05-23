import { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  IconButton,
  Theme,
  Tooltip,
} from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import "./styles/tokens.css";
import "./styles/base.css";
import { SettingsPanel } from "./settings/SettingsPanel";
import { EditorShell } from "./app/EditorShell";
import { SaveStateIndicator } from "./app/SaveStateIndicator";
import { SubmissionStaging } from "./app/SubmissionStaging";
import {
  RecentSubmissions,
  anyOpenFailing,
  type SubmissionRow,
} from "./app/RecentSubmissions";
import { CommandPalette, type CommandItem } from "./app/CommandPalette";
import { useSaveState } from "./drafts/useSaveState";
import { useCart } from "./drafts/useCart";
import {
  draftStoreSingleton,
  submissionCartSingleton,
} from "./drafts/store-instance";
import { createOctokit } from "./core/octokit";

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

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [stagingOpen, setStagingOpen] = useState(false);
  const [submissionsOpen, setSubmissionsOpen] = useState(false);
  const [submissionRows, setSubmissionRows] = useState<SubmissionRow[]>([]);
  const saveState = useSaveState(activePath, draftStoreSingleton);
  const cartEntries = useCart(submissionCartSingleton);
  const commands: CommandItem[] = useMemo(
    () => [
      {
        id: "open-coverage",
        label: "Open coverage dashboard",
        group: "Navigate",
        run: () => setActivePath(null),
      },
      {
        id: "open-batch",
        label: "Open submission batch",
        hint: cartEntries.length > 0 ? `${cartEntries.length} staged` : "empty",
        group: "Actions",
        run: () => setStagingOpen(true),
      },
      {
        id: "open-submissions",
        label: "Open recent submissions",
        group: "Actions",
        run: () => setSubmissionsOpen(true),
      },
      {
        id: "open-settings",
        label: "Open settings",
        group: "Actions",
        run: () => setSettingsOpen(true),
      },
    ],
    [cartEntries.length],
  );
  // The header's Submit-batch button + the staging dialog need an Octokit
  // instance. createOctokit throws if the PAT is missing; we render the
  // button anyway and let SubmissionStaging surface the failure on click.
  const headerOctokit = useMemo(() => {
    try {
      return createOctokit();
    } catch {
      return null;
    }
  }, []);
  return (
    <Theme accentColor="indigo" radius="medium">
      <Flex direction="column" style={{ height: "100vh", width: "100vw" }}>
        <Flex
          justify="between"
          align="center"
          px="4"
          py="2"
          style={{ borderBottom: "1px solid var(--gray-5)", flexShrink: 0 }}
        >
          <Heading size="4">Knowledge Editor</Heading>
          <Flex align="center" gap="3">
            <SaveStateIndicator state={saveState} />
            {headerOctokit && (
              <Button
                size="1"
                variant="soft"
                color={anyOpenFailing(submissionRows) ? "amber" : "gray"}
                onClick={() => setSubmissionsOpen(true)}
                title="My recent submissions + CI status"
              >
                Submissions
                {anyOpenFailing(submissionRows) && (
                  <Badge color="amber" radius="full" size="1">
                    !
                  </Badge>
                )}
              </Button>
            )}
            {cartEntries.length > 0 && (
              <Button
                size="1"
                variant="soft"
                color="indigo"
                onClick={() => setStagingOpen(true)}
              >
                <span aria-hidden="true">📋</span>
                Batch
                <Badge color="indigo" radius="full" size="1">
                  {cartEntries.length}
                </Badge>
              </Button>
            )}
            <Tooltip content="Settings">
              <IconButton
                variant="ghost"
                onClick={() => setSettingsOpen(true)}
                aria-label="Open settings"
              >
                <GearIcon />
              </IconButton>
            </Tooltip>
          </Flex>
        </Flex>
        <Box flexGrow="1" style={{ minHeight: 0 }}>
          <EditorShell
            onOpenSettings={() => setSettingsOpen(true)}
            activePath={activePath}
            setActivePath={setActivePath}
          />
        </Box>
        <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />
        {headerOctokit && (
          <SubmissionStaging
            cart={submissionCartSingleton}
            entries={cartEntries}
            octokit={headerOctokit}
            open={stagingOpen}
            onOpenChange={setStagingOpen}
          />
        )}
        {headerOctokit && (
          <RecentSubmissions
            octokit={headerOctokit}
            open={submissionsOpen}
            onOpenChange={setSubmissionsOpen}
            onLoaded={setSubmissionRows}
          />
        )}
        <CommandPalette commands={commands} />
      </Flex>
    </Theme>
  );
}
