import { useEffect, useState } from "react";
import type { Octokit } from "@octokit/rest";
import { Badge, Box, Flex, Heading, Switch, Text } from "@radix-ui/themes";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { listDirectories, listFilesByGlob } from "./githubApi";
import { loadOrderManifest } from "../lib/orderManifestLoader";
import { submissionCartSingleton } from "../drafts/store-instance";
import { useCart } from "../drafts/useCart";
import { AddSectionDialog } from "./AddSectionDialog";
import { appendSlug, moveSlug, removeSlug } from "../lib/orderManifest";
import { buildMarkdownStub } from "../lib/markdownStubs";
import { ReorderHandle } from "./ReorderHandle";
import { DeleteSectionDialog } from "./DeleteSectionDialog";
import { findReferences, loadAnchorIndex } from "../lib/anchorIndex";

interface SidebarProps {
  octokit: Octokit;
  pendingPaths: Set<string>;
  activePath: string | null;
  // `null` selects the Coverage dashboard (the landing surface).
  onSelect: (path: string | null) => void;
  wysiwygOn?: boolean;
  onToggleWysiwyg?: () => void;
}

// Same set as the original MetaEditScreen — components/src dirs that aren't
// editable components.
const SKIP_COMPONENT_DIRS = new Set(["categories", "guidelines"]);
const COMPONENT_VISIBLE_CAP = 20;

interface GroupedEntries {
  foundations: string[];
  accessibility: string[];
  patterns: string[];
  product: string[];
  writing: string[];
  components: string[];
  appContextApps: string[];
  appContextEntities: string[];
  appContextPatterns: string[];
}

/** Keys that carry file listings in GroupedEntries. */
type EntriesKey = keyof GroupedEntries;

/** Keys that carry sidebar section state (collapse, headers). "content"
 *  is a pure grouping parent — it has collapse state but no own files. */
type SectionKey = EntriesKey | "content";

const SECTION_KEYS: ReadonlyArray<SectionKey> = [
  "foundations",
  "accessibility",
  "content",
  "patterns",
  "product",
  "writing",
  "components",
  "appContextApps",
  "appContextEntities",
  "appContextPatterns",
];

// Author-language section labels (editing-experience direction: plain
// words a designer recognizes, never repo-shaped names). Vincent's IA
// (2026-07-11): Content is a nested parent, so its children read plainly
// ("Writing rules", "Patterns", "Product") without needing "copy"
// disambiguators; the application-context trio is "Products / Entities /
// Features" ("Features" matches what those files actually are:
// import-wizard, lineage-graph, marketplace-browsing…).
const CONTENT_GROUP_LABEL: Record<"patterns" | "product" | "writing", string> =
  {
    patterns: "Patterns",
    product: "Product",
    writing: "Writing rules",
  };

const APP_CONTEXT_LABEL: Record<"apps" | "entities" | "patterns", string> = {
  apps: "Products",
  entities: "Entities",
  patterns: "Features",
};

/** The Content parent's children, in display order — single source for the
 *  parent's guard, count, and render map. */
const CONTENT_GROUPS = ["writing", "patterns", "product"] as const;

// Uppercase group label separating the sidebar's two dimensions.
function DimensionHeader({ children }: { children: string }) {
  return (
    <Box px="3" pt="3" pb="1">
      <Text
        size="1"
        color="gray"
        weight="medium"
        style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}
      >
        {children}
      </Text>
    </Box>
  );
}

const SECTION_STORAGE_KEY = "sidebar.section.collapsed.v1";

function defaultCollapsed(): Record<SectionKey, boolean> {
  // All sections start collapsed — keeps the sidebar tight on first open;
  // the user expands only what they want to work in. Per-section state
  // persists across reloads via sessionStorage.
  return {
    foundations: true,
    accessibility: true,
    content: true,
    patterns: true,
    product: true,
    writing: true,
    components: true,
    appContextApps: true,
    appContextEntities: true,
    appContextPatterns: true,
  };
}

function loadCollapsedSections(): Record<SectionKey, boolean> {
  try {
    const raw = sessionStorage.getItem(SECTION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<SectionKey, boolean>>;
      const result = defaultCollapsed();
      for (const k of SECTION_KEYS) {
        if (typeof parsed[k] === "boolean") result[k] = parsed[k]!;
      }
      return result;
    }
  } catch {
    /* ignore parse / storage errors */
  }
  return defaultCollapsed();
}

// Apply a canonical `_order.json` sequence to a directory listing.
// Slugs in the order array land first in declared order; unlisted files
// fall to the end alphabetically (defensive — derive script would error
// on this drift, but UI shouldn't crash if a manifest entry temporarily
// lags a new file).
function applyOrder(files: string[], order?: string[]): string[] {
  if (!order) return files;
  const fileBySlug = new Map(files.map((f) => [slugFromPath(f), f]));
  const ordered: string[] = [];
  for (const slug of order) {
    const f = fileBySlug.get(slug);
    if (f) {
      ordered.push(f);
      fileBySlug.delete(slug);
    }
  }
  const leftover = [...fileBySlug.values()].sort();
  return [...ordered, ...leftover];
}

function slugFromPath(p: string): string {
  return p.split("/").pop()!.replace(/\.md$/, "");
}

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

export function Sidebar({
  octokit,
  pendingPaths,
  activePath,
  onSelect,
  wysiwygOn = false,
  onToggleWysiwyg,
}: SidebarProps) {
  const [entries, setEntries] = useState<GroupedEntries | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [sectionCollapsed, setSectionCollapsed] = useState<
    Record<SectionKey, boolean>
  >(() => loadCollapsedSections());
  const cartEntries = useCart(submissionCartSingleton);
  const inboxActive = activePath === "inbox";
  const [orderShas, setOrderShas] = useState<{
    foundations: string | null;
    accessibility: string | null;
  }>({ foundations: null, accessibility: null });
  const [addDialog, setAddDialog] = useState<{
    domain: string;
    subDir?: string;
    existingSlugs: string[];
  } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    domain: EntriesKey;
    slug: string;
    title: string;
    refCount: number;
    sampleRefs: string[];
    loading: boolean;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function toggleSection(group: SectionKey) {
    setSectionCollapsed((prev) => {
      const next = { ...prev, [group]: !prev[group] };
      try {
        sessionStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  /**
   * Returns the effective order + sha for a domain's _order.json, preferring
   * an already-staged cart entry so that chained ops (Add A → Add B,
   * Delete → Add, etc.) compose correctly instead of overwriting each other.
   * Falls through to remote only when the cart has no pending entry.
   */
  async function readOrderState(
    domain: "foundations" | "accessibility",
  ): Promise<{ order: string[]; sha: string } | null> {
    const path = `${domain}/src/_order.json`;
    const existing = submissionCartSingleton
      .list()
      .find((e) => e.path === path);
    if (existing && !existing.deleted) {
      try {
        const order = JSON.parse(existing.content) as unknown;
        if (Array.isArray(order) && order.every((s) => typeof s === "string")) {
          return { order: order as string[], sha: existing.basedOnSha };
        }
      } catch {
        // Malformed cart entry — fall through to remote
      }
    }
    return loadOrderManifest(octokit, `${domain}/src`);
  }

  async function handleAddSection(
    ctx: { domain: string; subDir?: string },
    slug: string,
    title: string,
  ) {
    const dir = ctx.subDir
      ? `${ctx.domain}/src/${ctx.subDir}`
      : `${ctx.domain}/src`;
    const filePath = `${dir}/${slug}.md`;
    const isOrdered =
      ctx.domain === "foundations" || ctx.domain === "accessibility";

    let nextOrder: string[] | null = null;

    if (isOrdered) {
      const current = await readOrderState(
        ctx.domain as "foundations" | "accessibility",
      );
      if (!current) {
        throw new Error(
          `handleAddSection: ${ctx.domain}/src/_order.json missing`,
        );
      }
      nextOrder = appendSlug(current.order, slug);
      submissionCartSingleton.add({
        path: `${ctx.domain}/src/_order.json`,
        content: JSON.stringify(nextOrder, null, 2) + "\n",
        basedOnSha: current.sha,
        addedAt: Date.now(),
      });
    }

    submissionCartSingleton.add({
      path: filePath,
      content: buildMarkdownStub(filePath, { title }),
      basedOnSha: "",
      addedAt: Date.now(),
    });

    // Optimistically insert the new row into entries so the sidebar reflects
    // the add immediately without a full page reload.
    // NOTE: entries store filenames (e.g. "color-primitives.md"), not full
    // paths — mirror the shape returned by listFilesByGlob so the render
    // loop's `foundations/src/${name}` concatenation stays correct.
    setEntries((prev) => {
      if (!prev) return prev;
      const domainKey = (ctx.subDir ?? ctx.domain) as EntriesKey;
      const list = prev[domainKey];
      const fileName = `${slug}.md`;
      if (list.includes(fileName)) return prev; // defensive
      if (isOrdered && nextOrder) {
        // For ordered domains, rebuild from the just-staged order array so
        // the new file lands in the declared position. Use filenames.
        return {
          ...prev,
          [domainKey]: nextOrder.map((s) => `${s}.md`),
        };
      }
      // Unordered (content sub-domains): append and sort.
      const nextList = [...list, fileName].sort();
      return { ...prev, [domainKey]: nextList };
    });

    onSelect(filePath);
  }

  function handleReorderDrop(
    domain: "foundations" | "accessibility",
    event: DragEndEvent,
  ) {
    try {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      // Prefer the cart's _order.json sha (written by a prior Add/Delete) so
      // chained ops compose on the correct basedOnSha. Fall back to the
      // initial remote sha stored in orderShas.
      const orderPath = `${domain}/src/_order.json`;
      const cartEntry = submissionCartSingleton
        .list()
        .find((e) => e.path === orderPath);
      const sha = cartEntry ? cartEntry.basedOnSha : orderShas[domain];
      if (!sha) {
        window.alert(
          `Couldn't reorder: missing _order.json for ${domain}. Try refreshing.`,
        );
        return;
      }
      const currentList = entries![domain].map(slugFromPath);
      const newIndex = currentList.indexOf(over.id as string);
      if (newIndex < 0) return;
      const nextOrder = moveSlug(currentList, active.id as string, newIndex);
      submissionCartSingleton.add({
        path: `${domain}/src/_order.json`,
        content: JSON.stringify(nextOrder, null, 2) + "\n",
        basedOnSha: sha,
        addedAt: Date.now(),
      });
      // Keep entries as filenames (e.g. "color-primitives.md") consistent
      // with the initial load from listFilesByGlob.
      setEntries((prev) =>
        prev
          ? {
              ...prev,
              [domain]: nextOrder.map((slug) => `${slug}.md`),
            }
          : prev,
      );
    } catch (err) {
      console.error("Reorder failed:", err);
      window.alert(
        `Couldn't reorder: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async function openDeleteDialog(domain: EntriesKey, slug: string) {
    // Open immediately in loading state so the click feels responsive.
    setDeleteDialog({
      domain,
      slug,
      title: humanizeSlug(slug),
      refCount: 0,
      sampleRefs: [],
      loading: true,
    });
    try {
      await loadAnchorIndex(octokit);
    } catch {
      // Index load failed (network, auth). Treat as unknown — proceed with
      // refCount=0 but the dialog is already open so the user can still cancel.
    }
    const refs = findReferences(slug);
    setDeleteDialog({
      domain,
      slug,
      title: humanizeSlug(slug),
      refCount: refs.length,
      sampleRefs: refs.slice(0, 3),
      loading: false,
    });
  }

  async function handleDeleteConfirm(slug: string) {
    if (!deleteDialog) return;
    const { domain } = deleteDialog;
    const isOrdered = domain === "foundations" || domain === "accessibility";
    // Content sub-domain (patterns/product/writing) paths land under content/src/<sub>/
    const filePath = isOrdered
      ? `${domain}/src/${slug}.md`
      : `content/src/${domain}/${slug}.md`;
    // Capture at handler entry — don't read activePath after the await (Fix #6).
    const wasActive = activePath === filePath;

    try {
      if (isOrdered) {
        const current = await readOrderState(domain);
        if (!current) {
          throw new Error(
            `Cannot delete from ${domain}: _order.json is missing. Refresh and try again.`,
          );
        }
        const nextOrder = removeSlug(current.order, slug);
        submissionCartSingleton.add({
          path: `${domain}/src/_order.json`,
          content: JSON.stringify(nextOrder, null, 2) + "\n",
          basedOnSha: current.sha,
          addedAt: Date.now(),
        });
      }
      submissionCartSingleton.add({
        path: filePath,
        content: "",
        basedOnSha: "",
        addedAt: Date.now(),
        deleted: true,
      });
      // Optimistically remove the row so the sidebar reflects the pending delete.
      // Fix #1: filter using slugFromPath so it matches against bare filenames
      // (e.g. "color.md") rather than full paths (e.g. "foundations/src/color.md").
      setEntries((prev) =>
        prev
          ? {
              ...prev,
              [domain]: prev[domain].filter((p) => slugFromPath(p) !== slug),
            }
          : prev,
      );
      setDeleteDialog(null);
      // If the deleted file was active when the user confirmed, navigate to the dashboard.
      if (wasActive) onSelect(null);
    } catch (err) {
      console.error("Delete section failed:", err);
      window.alert(
        `Couldn't delete section: ${err instanceof Error ? err.message : String(err)}`,
      );
      setDeleteDialog(null);
    }
  }

  useEffect(() => {
    (async () => {
      const [
        foundations,
        accessibility,
        patterns,
        product,
        writing,
        comps,
        foundationsOrder,
        accessibilityOrder,
        appContextApps,
        appContextEntities,
        appContextPatterns,
      ] = await Promise.all([
        listFilesByGlob(octokit, "foundations/src", {
          extension: ".md",
          exclude: ["AUTHORING.md"],
        }).catch(() => [] as string[]),
        listFilesByGlob(octokit, "accessibility/src", {
          extension: ".md",
          exclude: ["AUTHORING.md"],
        }).catch(() => [] as string[]),
        listFilesByGlob(octokit, "content/src/patterns", {
          extension: ".md",
          exclude: ["AUTHORING.md"],
        }).catch(() => [] as string[]),
        listFilesByGlob(octokit, "content/src/product", {
          extension: ".md",
          exclude: ["AUTHORING.md"],
        }).catch(() => [] as string[]),
        listFilesByGlob(octokit, "content/src/writing", {
          extension: ".md",
          exclude: ["AUTHORING.md"],
        }).catch(() => [] as string[]),
        listDirectories(octokit, "components/src").catch(() => [] as string[]),
        loadOrderManifest(octokit, "foundations/src").catch(() => null),
        loadOrderManifest(octokit, "accessibility/src").catch(() => null),
        listFilesByGlob(octokit, "app-context/src/apps", {
          extension: ".md",
          exclude: ["AUTHORING.md"],
        }).catch(() => [] as string[]),
        listFilesByGlob(octokit, "app-context/src/entities", {
          extension: ".md",
          exclude: ["AUTHORING.md"],
        }).catch(() => [] as string[]),
        listFilesByGlob(octokit, "app-context/src/patterns", {
          extension: ".md",
          exclude: ["AUTHORING.md"],
        }).catch(() => [] as string[]),
      ]);
      setEntries({
        foundations: applyOrder(foundations, foundationsOrder?.order),
        accessibility: applyOrder(accessibility, accessibilityOrder?.order),
        patterns,
        product,
        writing,
        components: comps.filter((c) => !SKIP_COMPONENT_DIRS.has(c)),
        appContextApps,
        appContextEntities,
        appContextPatterns,
      });
      setOrderShas({
        foundations: foundationsOrder?.sha ?? null,
        accessibility: accessibilityOrder?.sha ?? null,
      });
    })();
  }, [octokit]);

  // Preload the anchor index so the delete dialog's reference count is
  // accurate from the very first click. Silent failure is fine — the dialog
  // still works, it just shows refCount=0 (same as before the preload).
  useEffect(() => {
    loadAnchorIndex(octokit).catch((err) => {
      console.warn("Anchor index preload failed:", err);
    });
  }, [octokit]);

  if (!entries) {
    return (
      <Box p="3">
        <Text size="1" color="gray">
          Loading…
        </Text>
      </Box>
    );
  }

  function sectionHeader(
    key: SectionKey,
    label: string,
    count: number,
    listId: string,
    onAdd: (() => void) | null,
  ) {
    const collapsed = sectionCollapsed[key];
    const headerId = `sidebar-section-${key}-header`;
    return (
      <Flex
        id={headerId}
        align="center"
        justify="between"
        gap="2"
        px="3"
        py="2"
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        aria-controls={listId}
        style={{ cursor: "pointer", userSelect: "none" }}
        onClick={() => toggleSection(key)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleSection(key);
          }
        }}
      >
        <Flex align="center" gap="2">
          <span
            aria-hidden="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 16,
              height: 16,
              fontSize: 14,
              lineHeight: 1,
              fontWeight: 700,
              color: "var(--gray-12)",
              transition: "transform 120ms",
              transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
            }}
          >
            ▼
          </span>
          <Heading size="2">{label}</Heading>
        </Flex>
        <Flex align="center" gap="2">
          {onAdd != null && (
            <button
              type="button"
              aria-label={`Add ${label} section`}
              onClick={(e) => {
                e.stopPropagation();
                onAdd();
              }}
              style={{
                background: "none",
                border: "none",
                padding: "0 2px",
                cursor: "pointer",
                color: "var(--accent-11)",
                fontSize: "var(--font-size-1)",
                lineHeight: 1,
                fontFamily: "inherit",
              }}
            >
              + Add section
            </button>
          )}
          <Text size="1" color="gray">
            {count}
          </Text>
        </Flex>
      </Flex>
    );
  }

  // Unified row renderer for all groups.
  // Preserves: active-row highlight, draft-pending dot, onClick navigation.
  // leftHandle: drag grip element for ordered groups; null for unordered groups.
  // trashable: all groups except components (registry-driven, not author-curated).
  function renderRow({
    path,
    domain,
    leftHandle,
  }: {
    path: string;
    domain: EntriesKey;
    leftHandle: React.ReactNode | null;
  }) {
    const slug = slugFromPath(path);
    const isActive = activePath === path;
    const isDraft = pendingPaths.has(path);
    const trashable =
      domain !== "components" &&
      domain !== "appContextApps" &&
      domain !== "appContextEntities" &&
      domain !== "appContextPatterns";
    return (
      <Flex
        align="center"
        gap="2"
        px="3"
        py="1"
        style={{
          cursor: "pointer",
          background: isActive ? "var(--accent-3)" : "transparent",
          borderRadius: 4,
        }}
        onClick={() => onSelect(path)}
        title={path}
        data-detail="path"
      >
        {leftHandle}
        <Text size="2" style={{ flex: 1 }}>
          {humanizeSlug(slug)}
        </Text>
        {isDraft && (
          <span
            className="draft-dot"
            aria-label="unsaved changes"
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--accent-9)",
              display: "inline-block",
              flexShrink: 0,
            }}
          />
        )}
        {trashable && (
          <button
            type="button"
            aria-label={`Delete ${slug}`}
            onClick={(e) => {
              e.stopPropagation();
              openDeleteDialog(domain, slug);
            }}
            className="sidebar-row-trash"
            style={{
              background: "transparent",
              border: 0,
              cursor: "pointer",
              flexShrink: 0,
              padding: "0 2px",
              lineHeight: 1,
            }}
          >
            🗑
          </button>
        )}
      </Flex>
    );
  }

  const componentsVisible = expanded
    ? entries.components
    : entries.components.slice(0, COMPONENT_VISIBLE_CAP);

  const coverageActive = activePath == null;
  return (
    <Flex
      direction="column"
      gap="2"
      style={{
        width: 260,
        minWidth: 260,
        flexShrink: 0,
        borderRight: "1px solid var(--gray-5)",
        height: "100%",
        overflow: "auto",
      }}
    >
      <style>{`
        .sidebar-row-trash { opacity: 0; transition: opacity 80ms; }
        li:hover .sidebar-row-trash { opacity: 0.7; }
        li .sidebar-row-trash:hover { opacity: 1; }
      `}</style>
      <Flex
        align="center"
        gap="2"
        px="3"
        py="2"
        style={{
          cursor: "pointer",
          background: coverageActive ? "var(--accent-3)" : "transparent",
        }}
        onClick={() => onSelect(null)}
        aria-current={coverageActive ? "page" : undefined}
      >
        <span aria-hidden="true">🏠</span>
        <Text size="2" weight={coverageActive ? "bold" : "medium"}>
          Home
        </Text>
      </Flex>
      <Flex
        align="center"
        justify="between"
        gap="2"
        px="3"
        py="2"
        style={{
          cursor: "pointer",
          background: inboxActive ? "var(--accent-3)" : "transparent",
          borderBottom: "1px solid var(--gray-4)",
        }}
        onClick={() => onSelect("inbox")}
        aria-current={inboxActive ? "page" : undefined}
      >
        <Flex align="center" gap="2">
          <span aria-hidden="true">📥</span>
          <Text size="2" weight={inboxActive ? "bold" : "medium"}>
            Drafts
          </Text>
        </Flex>
        {cartEntries.length > 0 && (
          <Badge color="indigo" variant="soft" size="1">
            {cartEntries.length}
          </Badge>
        )}
      </Flex>

      {/* Two dimensions, one tree: what the design system PRESCRIBES
          (foundations, components, writing rules, accessibility) vs what
          the products ARE (apps, entities, UX patterns — the app-context
          domain). Group headers make the ontology visible without adding
          a nav surface or route. Both headers hide when their dimension
          has no sections, matching the per-section empty guards. */}
      {[
        entries.foundations,
        entries.accessibility,
        entries.patterns,
        entries.product,
        entries.writing,
        entries.components,
      ].some((e) => e.length > 0) && (
        <DimensionHeader>Design system</DimensionHeader>
      )}

      {entries.foundations.length > 0 && (
        <Box>
          {sectionHeader(
            "foundations",
            "Foundations",
            entries.foundations.length,
            "list-foundations",
            () => {
              const existingSlugs = entries.foundations.map(slugFromPath);
              setAddDialog({ domain: "foundations", existingSlugs });
            },
          )}
          {!sectionCollapsed.foundations && (
            <Box
              id="list-foundations"
              role="group"
              aria-labelledby="sidebar-section-foundations-header"
            >
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => handleReorderDrop("foundations", event)}
              >
                <SortableContext
                  items={entries.foundations.map(slugFromPath)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul
                    role="list"
                    style={{ listStyle: "none", padding: 0, margin: 0 }}
                  >
                    {entries.foundations.map((name) => {
                      const slug = slugFromPath(name);
                      const fullPath = `foundations/src/${name}`;
                      return (
                        <ReorderHandle key={slug} id={slug}>
                          {({ setNodeRef, style, handle }) => (
                            <li ref={setNodeRef} style={style}>
                              {renderRow({
                                path: fullPath,
                                domain: "foundations",
                                leftHandle: handle,
                              })}
                            </li>
                          )}
                        </ReorderHandle>
                      );
                    })}
                  </ul>
                </SortableContext>
              </DndContext>
            </Box>
          )}
        </Box>
      )}

      {/* Content is a nested parent: one "Content" section whose children
          (Writing rules / Patterns / Product) are indented beneath it —
          Vincent's IA, 2026-07-11. */}
      {CONTENT_GROUPS.some((g) => entries[g].length > 0) && (
        <Box>
          {sectionHeader(
            "content",
            "Content",
            CONTENT_GROUPS.reduce((n, g) => n + entries[g].length, 0),
            "list-content",
            null,
          )}
          {!sectionCollapsed.content && (
            <Box
              id="list-content"
              role="group"
              aria-labelledby="sidebar-section-content-header"
              pl="3"
            >
              {CONTENT_GROUPS.map((group) => {
                const items = entries[group];
                if (items.length === 0) return null;
                const label = CONTENT_GROUP_LABEL[group];
                const collapsed = sectionCollapsed[group];
                const listId = `list-${group}`;
                return (
                  <Box key={group}>
                    {sectionHeader(group, label, items.length, listId, () => {
                      const existingSlugs = items.map(slugFromPath);
                      setAddDialog({
                        domain: "content",
                        subDir: group,
                        existingSlugs,
                      });
                    })}
                    {!collapsed && (
                      <Box
                        id={listId}
                        role="group"
                        aria-labelledby={`sidebar-section-${group}-header`}
                      >
                        <ul
                          role="list"
                          style={{ listStyle: "none", padding: 0, margin: 0 }}
                        >
                          {items.map((path) => (
                            <li key={path}>
                              {renderRow({
                                path: `content/src/${group}/${path}`,
                                domain: group,
                                leftHandle: null,
                              })}
                            </li>
                          ))}
                        </ul>
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      )}

      {entries.accessibility.length > 0 && (
        <Box>
          {sectionHeader(
            "accessibility",
            "Accessibility",
            entries.accessibility.length,
            "list-accessibility",
            () => {
              const existingSlugs = entries.accessibility.map(slugFromPath);
              setAddDialog({ domain: "accessibility", existingSlugs });
            },
          )}
          {!sectionCollapsed.accessibility && (
            <Box
              id="list-accessibility"
              role="group"
              aria-labelledby="sidebar-section-accessibility-header"
            >
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => handleReorderDrop("accessibility", event)}
              >
                <SortableContext
                  items={entries.accessibility.map(slugFromPath)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul
                    role="list"
                    style={{ listStyle: "none", padding: 0, margin: 0 }}
                  >
                    {entries.accessibility.map((name) => {
                      const slug = slugFromPath(name);
                      const fullPath = `accessibility/src/${name}`;
                      return (
                        <ReorderHandle key={slug} id={slug}>
                          {({ setNodeRef, style, handle }) => (
                            <li ref={setNodeRef} style={style}>
                              {renderRow({
                                path: fullPath,
                                domain: "accessibility",
                                leftHandle: handle,
                              })}
                            </li>
                          )}
                        </ReorderHandle>
                      );
                    })}
                  </ul>
                </SortableContext>
              </DndContext>
            </Box>
          )}
        </Box>
      )}

      {entries.components.length > 0 && (
        <Box>
          {sectionHeader(
            "components",
            "Components",
            entries.components.length,
            "list-components",
            null,
          )}
          {!sectionCollapsed.components && (
            <Box
              id="list-components"
              role="group"
              aria-labelledby="sidebar-section-components-header"
            >
              <ul
                role="list"
                style={{ listStyle: "none", padding: 0, margin: 0 }}
              >
                {componentsVisible.map((slug) => (
                  <li key={slug}>
                    {renderRow({
                      path: `workspace/${slug}`,
                      domain: "components",
                      leftHandle: null,
                    })}
                  </li>
                ))}
              </ul>
              {!expanded &&
                entries.components.length > COMPONENT_VISIBLE_CAP && (
                  <Box px="3" py="1">
                    <Text
                      size="1"
                      style={{
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                      onClick={() => setExpanded(true)}
                    >
                      Show all ({entries.components.length})
                    </Text>
                  </Box>
                )}
            </Box>
          )}
        </Box>
      )}

      {[
        entries.appContextApps,
        entries.appContextEntities,
        entries.appContextPatterns,
      ].some((e) => e.length > 0) && (
        <DimensionHeader>Application context</DimensionHeader>
      )}

      {(
        [
          ["appContextApps", "apps"],
          ["appContextEntities", "entities"],
          ["appContextPatterns", "patterns"],
        ] as const
      ).map(([entriesKey, kind]) => {
        const items = entries[entriesKey];
        if (items.length === 0) return null;
        const label = APP_CONTEXT_LABEL[kind];
        const listId = `list-appcontext-${kind}`;
        const collapsed = sectionCollapsed[entriesKey];
        return (
          <Box key={entriesKey}>
            {sectionHeader(entriesKey, label, items.length, listId, null)}
            {!collapsed && (
              <Box
                id={listId}
                role="group"
                aria-labelledby={`sidebar-section-${entriesKey}-header`}
              >
                <ul
                  role="list"
                  style={{ listStyle: "none", padding: 0, margin: 0 }}
                >
                  {items.map((file) => (
                    <li key={file}>
                      {renderRow({
                        path: `app-context/src/${kind}/${file}`,
                        domain: entriesKey,
                        leftHandle: null,
                      })}
                    </li>
                  ))}
                </ul>
              </Box>
            )}
          </Box>
        );
      })}

      {addDialog && (
        <AddSectionDialog
          open
          domain={
            addDialog.subDir
              ? `${addDialog.domain}/${addDialog.subDir}`
              : addDialog.domain
          }
          pathPrefix={
            addDialog.subDir
              ? `${addDialog.domain}/src/${addDialog.subDir}`
              : `${addDialog.domain}/src`
          }
          existingSlugs={addDialog.existingSlugs}
          onCancel={() => setAddDialog(null)}
          onConfirm={async ({ title, slug }) => {
            const ctx = addDialog;
            setAddDialog(null);
            try {
              await handleAddSection(ctx, slug, title);
            } catch (err) {
              console.error("Add section failed:", err);
              window.alert(
                `Couldn't add section: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }}
        />
      )}
      {deleteDialog && (
        <DeleteSectionDialog
          open
          slug={deleteDialog.slug}
          title={deleteDialog.title}
          domain={deleteDialog.domain}
          refCount={deleteDialog.refCount}
          sampleRefs={deleteDialog.sampleRefs}
          loading={deleteDialog.loading}
          onCancel={() => setDeleteDialog(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}
      {onToggleWysiwyg && (
        <Flex
          align="center"
          gap="2"
          px="3"
          py="2"
          style={{ borderTop: "1px solid var(--gray-4)", marginTop: "auto" }}
        >
          <Switch
            id="wysiwyg-toggle"
            size="1"
            checked={wysiwygOn}
            onCheckedChange={onToggleWysiwyg}
            aria-label="Toggle WYSIWYG editor alpha"
          />
          <Text
            as="label"
            htmlFor="wysiwyg-toggle"
            size="1"
            color="gray"
            style={{ cursor: "pointer" }}
          >
            WYSIWYG editor (alpha)
          </Text>
        </Flex>
      )}
    </Flex>
  );
}
