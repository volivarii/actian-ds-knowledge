import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Flex,
  Theme,
} from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import "./styles/tokens.css";
import "./styles/dark-theme.css";
import "./styles/editor-chrome.css";
import "./styles/base.css";
import { SettingsPanel } from "./settings/SettingsPanel";
import { EditorShell } from "./app/EditorShell";
import type { ExploreTab } from "./app/HomeScreen";
import { useHashRoute } from "./lib/useHashRoute";
import {
  DEFAULT_EXPLORE_TAB,
  stateFromHash,
  WORKSPACE_RE,
} from "./lib/routes";
import { FreshnessChip } from "./app/FreshnessChip";
import { SignInScreen } from "./app/SignInScreen";
import { AppHeader } from "./app/AppHeader";
import { useCartAnnouncements } from "./drafts/useCartAnnouncements";
import { useSaveAnnouncements } from "./drafts/useSaveAnnouncements";
import { SubmissionStaging } from "./app/SubmissionStaging";
import {
  RecentSubmissions,
  anyOpenFailing,
  type SubmissionRow,
} from "./app/RecentSubmissions";
import { type CommandItem } from "./app/CommandPalette";
import { GlobalSearch } from "./app/GlobalSearch";
import { useSaveState } from "./drafts/useSaveState";
import { useCart } from "./drafts/useCart";
import {
  draftStoreSingleton,
  submissionCartSingleton,
} from "./drafts/store-instance";
import { createOctokit } from "./core/octokit";
import { loadComponentSlugs } from "./lib/componentSlugs";
import { loadAnchorIndex } from "./lib/anchorIndex";
import { buildSearchIndex } from "./lib/searchIndex";
import { loadContentFiles, type ContentFile } from "./lib/contentFiles";
import {
  DOMAINS,
  DOMAIN_LABEL,
  domainPathFor,
  PROSE_DOMAINS,
  type Domain,
} from "./lib/workspaceState";
import {
  bootstrap as bootstrapAuth,
  getSession,
  signInWithOAuth,
  signInWithPAT,
  subscribe,
} from "./auth";

/** Pull `<slug>` from `workspace/<slug>` or `components/src/<slug>/<anything>`. */
function activeComponentSlug(path: string | null): string | null {
  if (!path) return null;
  const ws = WORKSPACE_RE.exec(path);
  if (ws && ws[1]) return ws[1];
  const file = /^components\/src\/([^/]+)\//.exec(path);
  if (file && file[1] && file[1] !== "categories" && file[1] !== "guidelines") {
    return file[1];
  }
  return null;
}


export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Seeded from the address during the first render, not corrected by an
  // effect afterwards, so a deep link is never briefly the wrong screen.
  const [activePath, setActivePathState] = useState<string | null>(
    () => stateFromHash(window.location.hash).activePath,
  );
  // Every navigation, including one that lands where the app already is,
  // bumps this so the screen error boundary resets (see EditorShell). The
  // state setter alone bails out on an unchanged path and nothing re-renders.
  const [navigationSerial, setNavigationSerial] = useState(0);
  const setActivePath = useCallback((path: string | null) => {
    setNavigationSerial((n) => n + 1);
    setActivePathState(path);
  }, []);
  // The home screen's data tab lives here rather than in EditorShell because
  // the URL carries it, and one component owns everything the URL carries.
  // It still survives navigating into a file and back: App outlives the
  // HomeScreen that reads it.
  const [exploreTab, setExploreTab] = useState<ExploreTab>(
    () => stateFromHash(window.location.hash).exploreTab ?? DEFAULT_EXPLORE_TAB,
  );
  const [stagingOpen, setStagingOpen] = useState(false);
  const [submissionsOpen, setSubmissionsOpen] = useState(false);
  const [submissionRows, setSubmissionRows] = useState<SubmissionRow[]>([]);
  const [session, setSession] = useState(() => getSession());

  useEffect(() => {
    bootstrapAuth();
    setSession(getSession());
    const unsub = subscribe(setSession);
    return unsub;
  }, []);

  // The address and the navigation state stay in step, in both directions.
  const handleRoute = useCallback(
    (path: string | null, tab: ExploreTab | null) => {
      setActivePath(path);
      if (tab) setExploreTab(tab);
      // Back now repaints the screen, so a dialog left open would cover a
      // different file than the one it was opened over, and the press would
      // read as a no-op.
      setSettingsOpen(false);
      setStagingOpen(false);
      setSubmissionsOpen(false);
    },
    [],
  );
  useHashRoute({ activePath, exploreTab, onNavigate: handleRoute });

  const saveState = useSaveState(activePath, draftStoreSingleton);
  const cartEntries = useCart(submissionCartSingleton);
  // Staging is silent on screen except for a counter; the live region says
  // which file went in or out (F20).
  useCartAnnouncements(submissionCartSingleton, cartEntries);
  useSaveAnnouncements(draftStoreSingleton);
  // The header's Submit-batch button + the staging dialog need an Octokit
  // instance. createOctokit throws when no session; recompute when the
  // session changes so that signing in re-activates the dependent UI
  // without requiring a page reload.
  const headerOctokit = useMemo(() => {
    if (!session) return null;
    try {
      return createOctokit();
    } catch {
      return null;
    }
  }, [session]);
  // Lazy-load the known component slug set; it scopes the header search
  // index to the authorable components (buildSearchIndex's authorable set).
  const [knownSlugs, setKnownSlugs] = useState<string[]>([]);
  useEffect(() => {
    if (!headerOctokit) return;
    let cancelled = false;
    (async () => {
      const slugs = await loadComponentSlugs(headerOctokit);
      if (!cancelled) setKnownSlugs(slugs);
    })();
    return () => {
      cancelled = true;
    };
  }, [headerOctokit]);

  // Content files (content/src/{writing,patterns,product}) for the header
  // search's "Content" group: the graph's content:* nodes are derived and
  // not directly openable, so search sources a real file listing instead.
  const [contentFiles, setContentFiles] = useState<ContentFile[]>([]);
  useEffect(() => {
    if (!headerOctokit) return;
    let cancelled = false;
    void loadContentFiles(headerOctokit).then((f) => {
      if (!cancelled) setContentFiles(f);
    });
    return () => {
      cancelled = true;
    };
  }, [headerOctokit]);

  // One set, shared by the title index and the body index: search must not be
  // able to offer by body text a component it would not offer by name.
  const authorable = useMemo(() => new Set(knownSlugs), [knownSlugs]);
  const searchIndex = useMemo(
    () => buildSearchIndex(authorable, contentFiles),
    [authorable, contentFiles],
  );
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl-K focuses the header search instead of opening a modal.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const commands: CommandItem[] = useMemo(() => {
    const activeSlug = activeComponentSlug(activePath);
    const base: CommandItem[] = [
      {
        id: "open-home",
        label: "Go home",
        hint: "start page, coverage + needs attention",
        group: "Navigate",
        run: () => setActivePath(null),
      },
      {
        id: "open-inbox",
        label: "Open draft inbox",
        hint: cartEntries.length > 0 ? `${cartEntries.length} staged` : "empty",
        group: "Navigate",
        run: () => setActivePath("inbox"),
      },
      {
        id: "open-batch",
        label: "Open submission batch dialog",
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
      {
        id: "refresh-anchor-index",
        label: "Refresh anchor index",
        hint: "Re-scan all markdown for {#slug} markers",
        group: "Actions",
        run: () => {
          if (headerOctokit) {
            void loadAnchorIndex(headerOctokit, { force: true }).catch(
              () => {},
            );
          }
        },
      },
    ];
    // Component-context commands — surfaced only when an active
    // component is in scope (workspace OR a component-scoped file).
    if (activeSlug) {
      base.push({
        id: `ctx-workspace-${activeSlug}`,
        label: `Open workspace overview (${activeSlug})`,
        group: "Current component",
        run: () => setActivePath(`workspace/${activeSlug}`),
      });
      // PROSE_DOMAINS, not DOMAINS: tokens is YAML-backed and the dispatch
      // refuses it, so offering it was a guaranteed dead end that this work
      // would additionally have made shareable.
      for (const d of DOMAINS.filter((x) => PROSE_DOMAINS.has(x))) {
        base.push({
          id: `ctx-domain-${d}`,
          label: `Switch to ${DOMAIN_LABEL[d]}`,
          // domainPathFor, not a `${d}.md` template: tokens is YAML-backed,
          // so the template built a path to a file that does not exist, and the
          // address work turns that into a link somebody can share.
          hint: domainPathFor(activeSlug, d),
          group: "Current component",
          run: () => setActivePath(domainPathFor(activeSlug, d)),
        });
      }
      base.push({
        id: "ctx-meta",
        label: "Edit advanced metadata",
        hint: `${activeSlug}/_meta.yml`,
        group: "Current component",
        run: () => setActivePath(`components/src/${activeSlug}/_meta.yml`),
      });
    }
    return base;
  }, [activePath, cartEntries.length]);
  return (
    <Theme accentColor="indigo" radius="medium" appearance="dark">
      <Flex direction="column" style={{ height: "100vh", width: "100vw" }}>
        <AppHeader
          search={
            session ? (
              <GlobalSearch
                index={searchIndex}
                authorable={authorable}
                actions={commands}
                onOpenFile={setActivePath}
                inputRef={searchInputRef}
              />
            ) : null
          }
          freshness={headerOctokit ? <FreshnessChip octokit={headerOctokit} /> : null}
          saveState={saveState}
          submissions={
            headerOctokit
              ? {
                  failing: anyOpenFailing(submissionRows),
                  onOpen: () => setSubmissionsOpen(true),
                }
              : null
          }
          batchCount={cartEntries.length}
          mainPresent={session != null}
          onOpenStaging={() => setStagingOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <Box flexGrow="1" style={{ minHeight: 0 }}>
          {session == null ? (
            <SignInScreen
              onOAuthSignIn={async () => {
                await signInWithOAuth();
              }}
              onPATSignIn={(pat) => {
                signInWithPAT(pat);
              }}
            />
          ) : (
            <EditorShell
              navigationSerial={navigationSerial}
              onOpenSettings={() => setSettingsOpen(true)}
              octokit={headerOctokit ?? undefined}
              activePath={activePath}
              setActivePath={setActivePath}
              onOpenStaging={() => setStagingOpen(true)}
              onFocusSearch={() => searchInputRef.current?.focus()}
              exploreTab={exploreTab}
              onExploreTabChange={setExploreTab}
            />
          )}
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
      </Flex>
    </Theme>
  );
}
