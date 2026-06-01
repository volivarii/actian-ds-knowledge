// RJSF custom widget — tier-grouped accessibility-topics picker for a11y_refs.
//
// Replaces the raw RJSF array widget for the `a11y_refs` field in _meta.yml.
// Value shape: { ref: string; note?: string }[]
//
// Vocabulary doctrine: NEVER show the slug/ref to the author. Titles only.
// Any search result or chip renders the taxonomy title, not the raw slug.

import { useEffect, useMemo, useState } from "react";
import type { WidgetProps } from "@rjsf/utils";
import {
  Badge,
  Box,
  Button,
  Flex,
  Popover,
  Text,
  TextField,
} from "@radix-ui/themes";
import { Command } from "cmdk";
import type { Octokit } from "@octokit/rest";
import { buildTaxonomyFromAssets } from "../../substrate/buildTaxonomyFromAssets";
import { TopicResultRow } from "../../app/TopicResultRow";
import { loadCategoryA11yRefs } from "../../lib/loadCategoryA11yRefs";

interface A11yRef {
  ref: string;
  note?: string;
}

interface FormContextShape {
  octokit?: Octokit;
  category?: string | null;
}

export function A11yRefsWidget(props: WidgetProps) {
  const { value, onChange, disabled, readonly, formContext } = props;
  const { octokit, category } = (formContext ?? {}) as FormContextShape;

  const taxonomy = useMemo(() => buildTaxonomyFromAssets(), []);

  // Normalize value: accept array of {ref, note?} objects only.
  const refs: A11yRef[] = Array.isArray(value)
    ? value.filter(
        (r): r is A11yRef => !!r && typeof (r as A11yRef).ref === "string",
      )
    : [];

  const isDisabled = disabled || readonly;

  const [query, setQuery] = useState("");
  const [inheritedTitles, setInheritedTitles] = useState<string[]>([]);

  // Load category-inherited refs for the informational "Inherits from …" line.
  useEffect(() => {
    if (!octokit || !category) {
      setInheritedTitles([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const slugs = await loadCategoryA11yRefs(octokit, category);
      if (!cancelled) {
        const titles = slugs
          .map((s) => taxonomy.getTitle("accessibility", s) ?? s)
          .filter(Boolean);
        setInheritedTitles(titles);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [octokit, category, taxonomy]);

  function add(slug: string) {
    if (isDisabled) return;
    if (!refs.some((r) => r.ref === slug)) {
      onChange([...refs, { ref: slug }]);
    }
  }

  function remove(slug: string) {
    if (isDisabled) return;
    onChange(refs.filter((r) => r.ref !== slug));
  }

  function setNote(slug: string, note: string) {
    if (isDisabled) return;
    onChange(
      refs.map((r) =>
        r.ref === slug
          ? note.trim()
            ? { ref: slug, note: note.trim() }
            : { ref: slug }
          : r,
      ),
    );
  }

  // Typeahead results: accessibility domain, filtered to component-pattern and
  // foundation tiers, excluding already-picked refs.
  const results = useMemo(() => {
    if (!query.trim()) return [];
    return taxonomy
      .searchSections(query, { domain: "accessibility", limit: 30 })
      .filter((r) => r.tier === "component-pattern" || r.tier === "foundation")
      .filter((r) => !refs.some((p) => p.ref === r.slug));
  }, [taxonomy, query, refs]);

  const componentPatternResults = results.filter(
    (r) => r.tier === "component-pattern",
  );
  const foundationResults = results.filter((r) => r.tier === "foundation");

  return (
    <Box>
      {/* Chips — one per picked ref */}
      {refs.length > 0 && (
        <Flex gap="1" wrap="wrap" mb="2">
          {refs.map((r) => {
            const title = taxonomy.getTitle("accessibility", r.ref) ?? r.ref;
            const tier = taxonomy.getTier("accessibility", r.ref);
            const tierLabel = tier ? tier.replaceAll("-", " ") : null;
            return (
              <Badge
                key={r.ref}
                color="blue"
                variant="soft"
                size="2"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {title}
                {tierLabel && (
                  <Badge size="1" color="gray" variant="soft">
                    {tierLabel}
                  </Badge>
                )}
                {!isDisabled && (
                  <>
                    {/* Note popover */}
                    <Popover.Root>
                      <Popover.Trigger>
                        <Button
                          variant="ghost"
                          size="1"
                          color={r.note ? "blue" : "gray"}
                          aria-label={`Edit note for ${title}`}
                          style={{ padding: 0, minWidth: 0, lineHeight: 1 }}
                          title={r.note ? `Note: ${r.note}` : "Add a note"}
                        >
                          {r.note ? "✎·" : "✎"}
                        </Button>
                      </Popover.Trigger>
                      <Popover.Content style={{ minWidth: 260 }}>
                        <Text size="1" color="gray" as="div" mb="1">
                          Note for "{title}"
                        </Text>
                        <TextField.Root
                          key={r.note ?? ""}
                          size="1"
                          placeholder="Why this topic applies here…"
                          defaultValue={r.note ?? ""}
                          onBlur={(e) => setNote(r.ref, e.currentTarget.value)}
                        />
                      </Popover.Content>
                    </Popover.Root>
                    {/* Remove button */}
                    <Button
                      variant="ghost"
                      size="1"
                      color="gray"
                      aria-label={`Remove ${title}`}
                      onClick={() => remove(r.ref)}
                      style={{ padding: 0, minWidth: 0, lineHeight: 1 }}
                    >
                      ✕
                    </Button>
                  </>
                )}
              </Badge>
            );
          })}
        </Flex>
      )}

      {/* Inherits line — shown when category has inherited refs */}
      {inheritedTitles.length > 0 && (
        <Text size="1" color="gray" as="div" mb="2">
          Inherits from {category} category: {inheritedTitles.join(" · ")}
        </Text>
      )}

      {/* Typeahead — hidden when disabled/readonly */}
      {!isDisabled && (
        <Box
          style={{
            border: "1px solid var(--gray-5)",
            borderRadius: 6,
            maxWidth: 480,
          }}
        >
          <Command label="Accessibility topic search" shouldFilter={false}>
            <Command.Input
              placeholder="Search accessibility topics…"
              value={query}
              onValueChange={setQuery}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "none",
                outline: "none",
                borderBottom: "1px solid var(--gray-4)",
                background: "transparent",
                fontSize: 13,
              }}
            />
            <Command.List
              style={{
                maxHeight: 280,
                overflowY: "auto",
                padding: "4px 0",
              }}
            >
              {query.trim() === "" ? null : (
                <>
                  <Command.Empty>
                    <Text
                      size="1"
                      color="gray"
                      as="div"
                      style={{ padding: 12 }}
                    >
                      No matches.
                    </Text>
                  </Command.Empty>
                  {componentPatternResults.length > 0 && (
                    <Command.Group heading="Component patterns">
                      {componentPatternResults.map((r) => (
                        <Command.Item
                          key={r.slug}
                          value={r.slug}
                          onSelect={() => add(r.slug)}
                          style={{
                            display: "block",
                            cursor: "pointer",
                            padding: "2px 8px",
                          }}
                        >
                          <TopicResultRow result={r} />
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                  {foundationResults.length > 0 && (
                    <Command.Group heading="Foundations · usually set on the category">
                      {foundationResults.map((r) => (
                        <Command.Item
                          key={r.slug}
                          value={r.slug}
                          onSelect={() => add(r.slug)}
                          style={{
                            display: "block",
                            cursor: "pointer",
                            padding: "2px 8px",
                          }}
                        >
                          <TopicResultRow result={r} />
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                </>
              )}
            </Command.List>
          </Command>
        </Box>
      )}
    </Box>
  );
}
