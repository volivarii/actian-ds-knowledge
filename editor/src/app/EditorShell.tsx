import { useEffect, useMemo, useState } from "react";
import type { Octokit } from "@octokit/rest";
import { Box, Button, Callout, Flex, Tabs } from "@radix-ui/themes";
import type { UiSchema } from "@rjsf/utils";
import { createOctokit, MissingPATError } from "../core/octokit";
import { Sidebar } from "./Sidebar";
import { MetaEditScreen } from "./MetaEditScreen";
import { MarkdownEditScreen } from "./MarkdownEditScreen";
import { FrontmatterBodyEditScreen } from "./FrontmatterBodyEditScreen";
import { isAppContextFile, isCategoryFile } from "../lib/wysiwygPaths";
import { matchFrontmatterForm } from "../lib/frontmatterForms";
import { RefusalBanner } from "./RefusalBanner";
import { CoverageDashboard } from "./CoverageDashboard";
import { A11yCoverageDashboard } from "./A11yCoverageDashboard";
import { GraphHealthTab } from "./GraphHealthTab";
import { AuthoringWorkspace } from "./AuthoringWorkspace";
import { DraftInbox } from "./DraftInbox";
import { draftStoreSingleton } from "../drafts/store-instance";
import { isWysiwygEnabled, setWysiwygEnabled } from "../lib/editorFlags";

/** Section currently under the editor caret. MarkdownEditScreen renders
 *  the Section Inspector as a right-side panel alongside the body editor
 *  whenever this is non-null. */
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
}

/**
 * True for source markdown files routed to MarkdownEditScreen (the raw CodeMirror
 * or WYSIWYG body editor). Matches foundations, accessibility, component domain
 * files, and content files, excluding structural meta-files.
 *
 * NOTE: intentionally does NOT match content/src/writing/words-to-avoid.md
 * (which has a frontmatter form). EditorShell always checks the
 * frontmatterForms registry (see `matchFrontmatterForm`) BEFORE calling this
 * function, so that file is never accidentally routed here.
 */
export function isPlainMarkdown(path: string): boolean {
  return (
    (/^foundations\/src\/[^/]+\.md$/.test(path) ||
      /^accessibility\/src\/[^/]+\.md$/.test(path) ||
      /^components\/src\/(?!categories\/|AUTHORING\.md|EDITING-GUIDE\.md)[^/]+\/[^/]+\.md$/.test(
        path,
      ) ||
      /^content\/src\/(patterns|product|writing)\/[^/]+\.md$/.test(path) ||
      /^content\/src\/(?!AUTHORING\.md$|README\.md$|content-index\.md$)[^/]+\.md$/.test(
        path,
      )) &&
    !/AUTHORING\.md$/.test(path)
  );
}

// Re-exported from lib/wysiwygPaths so existing importers (and tests) keep
// working; the canonical definitions live there to avoid a circular import.
export { isAppContextFile, isCategoryFile };

// Thin re-export kept for editor/tests/app/appContextRouting.test.ts (the
// only external importer found by the Step 1 grep). The canonical routing
// decisions now live in lib/frontmatterForms; this delegates to it and
// narrows to the app-context shape that importer expects.
export function appContextKindConfig(path: string): {
  schemaKey: string;
  uiSchema: UiSchema;
  bodyless: boolean;
  flowAtDepth: number | null;
} | null {
  if (!isAppContextFile(path)) return null;
  const cfg = matchFrontmatterForm(path);
  if (!cfg) return null;
  return {
    schemaKey: cfg.schemaKey,
    uiSchema: cfg.uiSchema,
    bodyless: cfg.bodyless ?? false,
    flowAtDepth: cfg.flowAtDepth ?? null,
  };
}

// Category files (components/src/categories/<slug>.md) route to the
// frontmatter form editor, not the raw markdown editor — so they are
// deliberately excluded from isPlainMarkdown above. isCategoryFile is
// imported from lib/wysiwygPaths and re-exported above.

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

  const [landingTab, setLandingTab] = useState<
    "domains" | "accessibility" | "relationships"
  >("domains");

  const [pendingPaths, setPendingPaths] = useState<Set<string>>(() =>
    draftStoreSingleton.allPaths(),
  );

  const [wysiwygOn, setWysiwygOn] = useState(isWysiwygEnabled);

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

  const frontmatterForm =
    activePath != null ? matchFrontmatterForm(activePath) : null;

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
    pane = (
      <Tabs.Root
        value={landingTab}
        onValueChange={(v) =>
          setLandingTab(v as "domains" | "accessibility" | "relationships")
        }
      >
        <Tabs.List>
          <Tabs.Trigger value="domains">Domains</Tabs.Trigger>
          <Tabs.Trigger value="accessibility">Accessibility</Tabs.Trigger>
          <Tabs.Trigger value="relationships">Relationships</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="domains">
          <CoverageDashboard octokit={gh} onOpenFile={setActivePathSafe} />
        </Tabs.Content>
        <Tabs.Content value="accessibility">
          <A11yCoverageDashboard octokit={gh} onOpenFile={setActivePathSafe} />
        </Tabs.Content>
        <Tabs.Content value="relationships">
          <GraphHealthTab onOpenFile={setActivePathSafe} />
        </Tabs.Content>
      </Tabs.Root>
    );
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
  } else if (frontmatterForm) {
    pane = (
      <FrontmatterBodyEditScreen
        path={activePath}
        schemaKey={frontmatterForm.schemaKey}
        uiSchema={frontmatterForm.uiSchema}
        bodyless={frontmatterForm.bodyless}
        yamlFlowAtDepth={frontmatterForm.flowAtDepth}
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
      />
    );
  } else {
    pane = (
      <RefusalBanner path={activePath} onBack={() => setActivePathSafe(null)} />
    );
  }

  // When auth hasn't initialised, render the file content standalone (no
  // sidebar). Production never hits this path — App.tsx only mounts
  // EditorShell after sign-in.
  if (!gh) {
    return (
      <Box p="3" style={{ height: "100%", minHeight: 0 }}>
        {breadcrumb}
        {pane}
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
        wysiwygOn={wysiwygOn}
        onToggleWysiwyg={() => {
          const next = !wysiwygOn;
          setWysiwygEnabled(next);
          setWysiwygOn(next);
        }}
      />
      <Box
        flexGrow="1"
        p="3"
        style={{ overflow: "auto", minWidth: 0, minHeight: 0 }}
      >
        {breadcrumb}
        {pane}
      </Box>
    </Flex>
  );
}
