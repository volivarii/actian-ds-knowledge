import { useEffect, useMemo, useState } from "react";
import type { Octokit } from "@octokit/rest";
import { Box, Button, Callout, Flex, Tabs } from "@radix-ui/themes";
import { createOctokit, MissingPATError } from "../core/octokit";
import { Sidebar } from "./Sidebar";
import { MetaEditScreen } from "./MetaEditScreen";
import { MarkdownEditScreen } from "./MarkdownEditScreen";
import { RefusalBanner } from "./RefusalBanner";
import { CoverageDashboard } from "./CoverageDashboard";
import { AuthoringWorkspace } from "./AuthoringWorkspace";
import { DraftInbox } from "./DraftInbox";
import { SectionInspector } from "./SectionInspector";
import type { Taxonomy } from "../substrate";
import { draftStoreSingleton } from "../drafts/store-instance";

/** Section currently under the editor caret. Drives the right-pane mode. */
export interface FocusedSectionContext {
  file: string;
  anchor: string;
  level: 2 | 3;
  line: number;
}

interface EditorShellProps {
  onOpenSettings?: () => void;
  octokit?: Octokit;
  activePath?: string | null;
  setActivePath?: (path: string | null) => void;
  /** Opens the SubmissionStaging dialog (owned by App). Used by the
   *  DraftInbox surface to offer a one-click escalation to submit. */
  onOpenStaging?: () => void;
  /** Section the editor caret is currently inside. When non-null the
   *  right pane auto-switches to the contextual "Section" tab. v1 wires
   *  the prop + tab UI; the SectionInspector itself renders with stub
   *  taxonomy/connections until follow-up tasks plumb the live data. */
  focusedSection?: FocusedSectionContext | null;
}

/** Minimal Taxonomy stub for the v1 SectionInspector mount. The real
 *  Substrate Service hookup (loadTaxonomy + buildRefGraph wired to the
 *  active file's frontmatter) is a follow-up; this stub keeps the
 *  inspector mountable without crashing while connections/incoming are
 *  still empty. */
const passthroughStubTaxonomy: Taxonomy = {
  getSlugs: () => [],
  getTitle: () => null,
  getBody: () => null,
  domainOfSlug: () => null,
  searchSections: () => [],
};

function isPlainMarkdown(path: string): boolean {
  return (
    (/^foundations\/src\/[^/]+\.md$/.test(path) ||
      /^accessibility\/src\/[^/]+\.md$/.test(path) ||
      /^components\/src\/(?!categories\/AUTHORING\.md|AUTHORING\.md|EDITING-GUIDE\.md)[^/]+\/[^/]+\.md$/.test(
        path,
      ) ||
      /^components\/src\/categories\/[^/]+\.md$/.test(path) ||
      /^content\/src\/(patterns|product|writing)\/[^/]+\.md$/.test(path)) &&
    !/AUTHORING\.md$/.test(path)
  );
}

function isMetaYaml(path: string): boolean {
  return /^components\/src\/[^/]+\/_meta\.yml$/.test(path);
}

const WORKSPACE_RE = /^workspace\/([a-z0-9][a-z0-9-]*)$/;
function workspaceSlug(path: string): string | null {
  const m = WORKSPACE_RE.exec(path);
  return m && m[1] ? m[1] : null;
}

// Component-scoped child files (per-component metadata, domain MDs)
// surface a breadcrumb back to the slug's Authoring Workspace.
const COMPONENT_CHILD_RE = /^components\/src\/([^/]+)\/[^/]+\.(?:yml|md)$/;
function parentWorkspaceOf(path: string): string | null {
  const m = COMPONENT_CHILD_RE.exec(path);
  if (!m || !m[1] || m[1] === "categories" || m[1] === "guidelines")
    return null;
  return `workspace/${m[1]}`;
}

export function EditorShell({
  onOpenSettings,
  octokit,
  activePath = null,
  setActivePath,
  onOpenStaging,
  focusedSection: focusedSectionProp = null,
}: EditorShellProps) {
  const setActivePathSafe = setActivePath ?? (() => {});
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

  // Cursor-driven focused section: MarkdownEditScreen reports its caret
  // position via onFocusedSectionChange; we resolve to that when the
  // explicit prop isn't supplied. Tests + external integrations can still
  // override by passing focusedSection directly.
  const [cursorFocused, setCursorFocused] =
    useState<FocusedSectionContext | null>(null);
  const focusedSection = focusedSectionProp ?? cursorFocused;

  // Tabs are controlled so the parent (cursor → focusedSection) can
  // drive the active tab AND the user can still flip back manually. The
  // section tab is disabled when no section is focused — keeps the
  // toggle from showing an empty contextual surface in the default state.
  const [tabValue, setTabValue] = useState<"file" | "section">(
    focusedSection ? "section" : "file",
  );
  useEffect(() => {
    if (focusedSection) setTabValue("section");
    else setTabValue("file");
  }, [focusedSection?.file, focusedSection?.anchor]);

  const [pendingPaths, setPendingPaths] = useState<Set<string>>(() =>
    draftStoreSingleton.allPaths(),
  );

  useEffect(() => {
    const refresh = () => setPendingPaths(draftStoreSingleton.allPaths());
    // React in real time to draft mutations (pending/cleared/saved) so the
    // sidebar dot updates on discard without waiting for a window focus.
    const unsubscribe = draftStoreSingleton.subscribe(refresh);
    // Keep the focus refresh too — covers the cross-tab case where another
    // tab cleared a draft and emit events don't fire in this tab.
    window.addEventListener("focus", refresh);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", refresh);
    };
  }, []);

  // Compute the File-tab pane content. When auth isn't wired we still
  // render the tab UI (so authors can see "Section" is contextually
  // available) but surface the auth error / signed-out state INSIDE the
  // File tab — the right pane never becomes a blank surface.
  const wsSlug = activePath ? workspaceSlug(activePath) : null;
  const parentWs = activePath ? parentWorkspaceOf(activePath) : null;
  const breadcrumb = parentWs ? (
    <Box mb="2">
      <Button
        variant="ghost"
        size="1"
        onClick={() => setActivePathSafe(parentWs)}
      >
        ← Back to workspace
      </Button>
    </Box>
  ) : null;

  let pane: React.ReactNode;
  if (ghError) {
    pane = (
      <Callout.Root color="amber">
        <Callout.Text>{ghError}</Callout.Text>
      </Callout.Root>
    );
  } else if (!gh) {
    pane = null;
  } else if (activePath == null) {
    pane = <CoverageDashboard octokit={gh} onOpenFile={setActivePathSafe} />;
  } else if (activePath === "inbox") {
    pane = (
      <DraftInbox
        onOpenFile={setActivePathSafe}
        onOpenStaging={() => onOpenStaging?.()}
      />
    );
  } else if (wsSlug) {
    pane = (
      <AuthoringWorkspace
        slug={wsSlug}
        octokit={gh}
        onNavigate={setActivePathSafe}
        onBack={() => setActivePathSafe(null)}
      />
    );
  } else if (isMetaYaml(activePath)) {
    pane = (
      <MetaEditScreen
        path={activePath}
        octokit={gh}
        onOpenSettings={onOpenSettings}
        onNavigate={setActivePathSafe}
      />
    );
  } else if (isPlainMarkdown(activePath)) {
    pane = (
      <MarkdownEditScreen
        path={activePath}
        octokit={gh}
        onOpenSettings={onOpenSettings}
        onNavigate={setActivePathSafe}
        onFocusedSectionChange={setCursorFocused}
      />
    );
  } else {
    pane = (
      <RefusalBanner path={activePath} onBack={() => setActivePathSafe(null)} />
    );
  }

  // Section tab label includes the focused anchor (or "(no section)" when
  // disabled). Doctrine: author-visible text uses topic/section vocabulary,
  // never "slug" / "ref" / "frontmatter" — guarded by T10.
  const sectionLabel = focusedSection
    ? `Section: ${focusedSection.anchor}`
    : "Section";

  const tabs = (
    <Tabs.Root
      value={tabValue}
      onValueChange={(v) => setTabValue(v as "file" | "section")}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      <Tabs.List>
        <Tabs.Trigger value="file">File</Tabs.Trigger>
        <Tabs.Trigger value="section" disabled={!focusedSection}>
          {sectionLabel}
        </Tabs.Trigger>
      </Tabs.List>
      <Box flexGrow="1" pt="3" style={{ minHeight: 0, overflow: "auto" }}>
        <Tabs.Content value="file" style={{ height: "100%" }}>
          {breadcrumb}
          {pane}
        </Tabs.Content>
        <Tabs.Content value="section" style={{ height: "100%" }}>
          <SectionInspector
            sectionTitle={focusedSection?.anchor ?? "(no section)"}
            outgoing={[]}
            incoming={[]}
            taxonomy={passthroughStubTaxonomy}
            onAddConnection={() => {}}
            onRemoveConnection={() => {}}
            onRepointConnection={() => {}}
          />
        </Tabs.Content>
      </Box>
    </Tabs.Root>
  );

  // When auth hasn't initialised, render the tab shell standalone (no
  // sidebar). Keeps the right-pane mode toggle visible + lets the smoke
  // test render EditorShell without an octokit. Production never hits
  // this path — App.tsx only mounts EditorShell after sign-in.
  if (!gh) {
    return (
      <Box p="3" style={{ height: "100%", minHeight: 0 }}>
        {tabs}
      </Box>
    );
  }

  return (
    <Flex style={{ height: "100%", minHeight: 0 }}>
      <Sidebar
        octokit={gh}
        pendingPaths={pendingPaths}
        activePath={activePath}
        onSelect={setActivePathSafe}
      />
      <Box
        flexGrow="1"
        p="3"
        style={{ overflow: "auto", minWidth: 0, minHeight: 0 }}
      >
        {tabs}
      </Box>
    </Flex>
  );
}
