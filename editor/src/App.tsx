import { useState } from "react";
import {
  Box,
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
        <Box flexGrow="1" style={{ minHeight: 0 }}>
          <EditorShell onOpenSettings={() => setSettingsOpen(true)} />
        </Box>
        <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />
      </Flex>
    </Theme>
  );
}
