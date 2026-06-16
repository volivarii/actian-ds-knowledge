// Toolbar control: browse the design-system media captured for THIS
// component (by role, never by path) and insert the canonical <Media>
// directive. Replaces the old free-text <Media src=""> skeleton.

import { useEffect, useRef, useState } from "react";
import type { Octokit } from "@octokit/rest";
import {
  Button,
  Flex,
  Popover,
  ScrollArea,
  Spinner,
  Text,
  Tooltip,
} from "@radix-ui/themes";
import {
  loadMediaRoles,
  type MediaRole,
  type MediaRoleEntry,
} from "../lib/loadMediaIndex";
import { getBinaryFileAsDataUrl } from "../app/githubApi";

const LAYOUTS = ["grid", "stack", "inline"] as const;
type Layout = (typeof LAYOUTS)[number];

const ROLE_LABEL: Record<MediaRole, string> = {
  parts: "Anatomy / parts",
  variations: "Variations",
  spacing: "Spacing & size",
  behavior: "Behavior",
  layout: "Layout",
};

export interface MediaPickerPopoverProps {
  octokit: Octokit;
  componentSlug: string;
  /** Receives the ready-to-insert directive, e.g. `\n<Media role="parts" layout="grid" />\n`. */
  onInsert: (snippet: string) => void;
}

export function MediaPickerPopover({
  octokit,
  componentSlug,
  onInsert,
}: MediaPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [roles, setRoles] = useState<MediaRoleEntry[] | null>(null);
  const [selected, setSelected] = useState<MediaRole | null>(null);
  const [layout, setLayout] = useState<Layout>("grid");
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  // Always tracks the current slug so in-flight fetches can detect staleness.
  const slugRef = useRef(componentSlug);

  // The parent (MarkdownEditScreen) is not remounted on file navigation, so
  // when the component changes we must drop the cached roles/thumbs — else the
  // picker would offer the previous component's media. Closes the popover too.
  useEffect(() => {
    slugRef.current = componentSlug;
    setOpen(false);
    setRoles(null);
    setSelected(null);
    setLayout("grid");
    setThumbs({});
    setLoading(false);
  }, [componentSlug]);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next || roles !== null) return;
    const slugAtOpen = componentSlug;
    setLoading(true);
    const found = await loadMediaRoles(octokit, componentSlug);
    if (slugRef.current !== slugAtOpen) return; // navigated away mid-fetch — discard
    setRoles(found);
    setSelected(found[0]?.role ?? null);
    setLoading(false);
    for (const r of found) {
      const firstPath = r.paths[0];
      if (!firstPath) continue;
      void getBinaryFileAsDataUrl(octokit, firstPath)
        .then((url) => {
          if (slugRef.current !== slugAtOpen) return; // stale — drop
          setThumbs((t) => ({ ...t, [r.role]: url }));
        })
        .catch(() => {
          /* thumbnail is decorative — ignore fetch failures */
        });
    }
  }

  function handleInsert() {
    if (!selected) return;
    onInsert(`\n<Media role="${selected}" layout="${layout}" />\n`);
    setOpen(false);
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Tooltip content="Insert design-system media">
        <Popover.Trigger>
          <Button size="2" variant="soft" aria-label="Open insert media picker">
            {"<Media/>"}
          </Button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Content size="2" style={{ width: 320 }}>
        {loading && <Spinner />}
        {!loading && roles !== null && roles.length === 0 && (
          <Text size="2" color="gray">
            No captured media for this component yet.
          </Text>
        )}
        {!loading && roles && roles.length > 0 && (
          <Flex direction="column" gap="2">
            <Text size="1" color="gray">
              Pick a media role
            </Text>
            <ScrollArea style={{ maxHeight: 240 }}>
              <Flex direction="column" gap="1">
                {roles.map((r) => (
                  <Button
                    key={r.role}
                    variant={selected === r.role ? "solid" : "soft"}
                    aria-pressed={selected === r.role}
                    onClick={() => setSelected(r.role)}
                    style={{
                      justifyContent: "flex-start",
                      height: "auto",
                      padding: 8,
                    }}
                  >
                    <Flex align="center" gap="2">
                      {thumbs[r.role] ? (
                        <img
                          src={thumbs[r.role]}
                          alt=""
                          width={48}
                          height={36}
                          style={{ objectFit: "cover", borderRadius: 4 }}
                        />
                      ) : (
                        <span
                          style={{
                            width: 48,
                            height: 36,
                            background: "var(--gray-4)",
                            borderRadius: 4,
                          }}
                        />
                      )}
                      <Flex direction="column" align="start">
                        <Text size="2">{ROLE_LABEL[r.role]}</Text>
                        <Text size="1" color="gray">
                          {r.paths.length} image
                          {r.paths.length === 1 ? "" : "s"}
                        </Text>
                      </Flex>
                    </Flex>
                  </Button>
                ))}
              </Flex>
            </ScrollArea>
            <Flex align="center" gap="2" justify="between">
              <Text size="1" color="gray">
                Display
              </Text>
              {/* Native select avoids Radix Select's DocumentFragment portal dependency */}
              <select
                aria-label="Media layout"
                value={layout}
                onChange={(e) => setLayout(e.target.value as Layout)}
                style={{ fontSize: "var(--font-size-2)" }}
              >
                {LAYOUTS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Flex>
            <Button onClick={handleInsert} disabled={!selected}>
              Insert &lt;Media /&gt;
            </Button>
          </Flex>
        )}
      </Popover.Content>
    </Popover.Root>
  );
}
