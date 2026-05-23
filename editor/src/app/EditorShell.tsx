import { useEffect, useMemo, useState } from "react";
import type { Octokit } from "@octokit/rest";
import { Box, Callout, Flex } from "@radix-ui/themes";
import { createOctokit, MissingPATError } from "../core/octokit";
import { Sidebar } from "./Sidebar";
import { MetaEditScreen } from "./MetaEditScreen";
import { MarkdownEditScreen } from "./MarkdownEditScreen";
import { RefusalBanner } from "./RefusalBanner";
import { DraftStore } from "../drafts/DraftStore";

interface EditorShellProps {
  onOpenSettings?: () => void;
  octokit?: Octokit;
}

function isPlainMarkdown(path: string): boolean {
  return (
    (/^foundations\/src\/[^/]+\.md$/.test(path) ||
      /^accessibility\/[^/]+\.md$/.test(path)) &&
    !/AUTHORING\.md$/.test(path)
  );
}

function isMetaYaml(path: string): boolean {
  return /^components\/src\/[^/]+\/_meta\.yml$/.test(path);
}

const draftStoreSingleton = new DraftStore(
  typeof window !== "undefined"
    ? window.localStorage
    : (null as unknown as Storage),
);

export function EditorShell({ onOpenSettings, octokit }: EditorShellProps) {
  const [ghError, setGhError] = useState<string | null>(null);
  const gh = useMemo<Octokit | null>(() => {
    if (octokit) return octokit;
    try {
      return createOctokit();
    } catch (err) {
      setGhError(
        err instanceof MissingPATError ? err.message : (err as Error).message,
      );
      return null;
    }
  }, [octokit]);

  const [activePath, setActivePath] = useState<string | null>(null);
  const [pendingPaths, setPendingPaths] = useState<Set<string>>(() =>
    draftStoreSingleton.allPaths(),
  );

  useEffect(() => {
    const onFocus = () => setPendingPaths(draftStoreSingleton.allPaths());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  if (ghError) {
    return (
      <Callout.Root color="amber">
        <Callout.Text>{ghError}</Callout.Text>
      </Callout.Root>
    );
  }
  if (!gh) return null;

  let pane: React.ReactNode;
  if (activePath == null) {
    pane = (
      <Callout.Root>
        <Callout.Text>Choose a file in the sidebar to begin.</Callout.Text>
      </Callout.Root>
    );
  } else if (isMetaYaml(activePath)) {
    pane = (
      <MetaEditScreen
        path={activePath}
        octokit={gh}
        onOpenSettings={onOpenSettings}
      />
    );
  } else if (isPlainMarkdown(activePath)) {
    pane = (
      <MarkdownEditScreen
        path={activePath}
        octokit={gh}
        onOpenSettings={onOpenSettings}
      />
    );
  } else {
    pane = (
      <RefusalBanner path={activePath} onBack={() => setActivePath(null)} />
    );
  }

  return (
    <Flex style={{ height: "100%", minHeight: 0 }}>
      <Sidebar
        octokit={gh}
        pendingPaths={pendingPaths}
        activePath={activePath}
        onSelect={setActivePath}
      />
      <Box
        flexGrow="1"
        p="3"
        style={{ overflow: "auto", minWidth: 0, minHeight: 0 }}
      >
        {pane}
      </Box>
    </Flex>
  );
}
