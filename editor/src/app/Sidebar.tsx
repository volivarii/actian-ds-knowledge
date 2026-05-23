import { useEffect, useState } from "react";
import type { Octokit } from "@octokit/rest";
import { Box, Flex, Heading, Text } from "@radix-ui/themes";
import { listDirectories, listFilesByGlob } from "./githubApi";

interface SidebarProps {
  octokit: Octokit;
  pendingPaths: Set<string>;
  activePath: string | null;
  // `null` selects the Coverage dashboard (the landing surface).
  onSelect: (path: string | null) => void;
}

// Same set as the original MetaEditScreen — components/src dirs that aren't
// editable components.
const SKIP_COMPONENT_DIRS = new Set(["categories", "guidelines"]);
const COMPONENT_VISIBLE_CAP = 20;

interface GroupedEntries {
  foundations: string[];
  accessibility: string[];
  components: string[];
}

export function Sidebar({
  octokit,
  pendingPaths,
  activePath,
  onSelect,
}: SidebarProps) {
  const [entries, setEntries] = useState<GroupedEntries | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      const [foundations, accessibility, comps] = await Promise.all([
        listFilesByGlob(octokit, "foundations/src", {
          extension: ".md",
          exclude: ["AUTHORING.md"],
        }).catch(() => [] as string[]),
        listFilesByGlob(octokit, "accessibility", {
          extension: ".md",
          exclude: ["AUTHORING.md"],
        }).catch(() => [] as string[]),
        listDirectories(octokit, "components/src").catch(() => [] as string[]),
      ]);
      setEntries({
        foundations,
        accessibility,
        components: comps.filter((c) => !SKIP_COMPONENT_DIRS.has(c)),
      });
    })();
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

  function row(path: string, label: string) {
    const isActive = activePath === path;
    const isDraft = pendingPaths.has(path);
    return (
      <Flex
        key={path}
        justify="between"
        align="center"
        px="3"
        py="1"
        style={{
          cursor: "pointer",
          background: isActive ? "var(--accent-3)" : "transparent",
        }}
        onClick={() => onSelect(path)}
      >
        <Text size="2">{label}</Text>
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
            }}
          />
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
      <Flex
        align="center"
        gap="2"
        px="3"
        py="2"
        style={{
          cursor: "pointer",
          background: coverageActive ? "var(--accent-3)" : "transparent",
          borderBottom: "1px solid var(--gray-4)",
        }}
        onClick={() => onSelect(null)}
        aria-current={coverageActive ? "page" : undefined}
      >
        <span aria-hidden="true">📊</span>
        <Text size="2" weight={coverageActive ? "bold" : "medium"}>
          Coverage
        </Text>
      </Flex>

      <Box p="3">
        <Heading size="2">Foundations</Heading>
      </Box>
      {entries.foundations.map((name) => row(`foundations/src/${name}`, name))}

      <Box p="3">
        <Heading size="2">Accessibility</Heading>
      </Box>
      {entries.accessibility.map((name) => row(`accessibility/${name}`, name))}

      <Box p="3">
        <Heading size="2">Components ({entries.components.length})</Heading>
      </Box>
      {componentsVisible.map((slug) =>
        row(`components/src/${slug}/_meta.yml`, slug),
      )}
      {!expanded && entries.components.length > COMPONENT_VISIBLE_CAP && (
        <Box px="3" py="1">
          <Text
            size="1"
            style={{ cursor: "pointer", textDecoration: "underline" }}
            onClick={() => setExpanded(true)}
          >
            Show all ({entries.components.length})
          </Text>
        </Box>
      )}
    </Flex>
  );
}
