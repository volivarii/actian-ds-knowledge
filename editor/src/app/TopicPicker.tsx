// TopicPicker — typeahead for connecting a section to another topic.
// Vocabulary contract: never displays "slug", "ref", or the underlying
// frontmatter field name to the author. Results show title + domain chip
// + body excerpt. Guarded by tests/app/doctrine-guards.test.tsx (T10).

import React, { useMemo, useState } from "react";
import { Box, Button, Card, Flex, Text, TextField } from "@radix-ui/themes";
import type { SearchResult, Taxonomy } from "../substrate";
import { TopicResultRow } from "./TopicResultRow";

export interface PickedTopic {
  slug: string;
  domain: "accessibility" | "motion";
  title: string;
  note: string | null;
}

export interface TopicPickerProps {
  taxonomy: Taxonomy;
  onPick: (topic: PickedTopic) => void;
  onCancel: () => void;
}

export function TopicPicker(props: TopicPickerProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [note, setNote] = useState("");

  const results = useMemo(
    () => props.taxonomy.searchSections(query, { limit: 20 }),
    [query, props.taxonomy],
  );

  return (
    <Box p="3">
      <TextField.Root
        placeholder="Find a topic…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <Flex
        direction="column"
        gap="2"
        mt="3"
        style={{ maxHeight: 320, overflow: "auto" }}
      >
        {results.map((r) => (
          <TopicResultRow
            key={`${r.domain}:${r.slug}`}
            result={r}
            selected={selected?.slug === r.slug}
            onClick={() => setSelected(r)}
          />
        ))}
        {query.length > 0 && results.length === 0 ? (
          <Text size="2" color="gray">
            No topics match "{query}".
          </Text>
        ) : null}
      </Flex>

      {selected ? (
        <Box
          mt="3"
          p="2"
          style={{ background: "var(--gray-2)", borderRadius: 4 }}
        >
          <Text size="1" color="gray">
            Optional note
          </Text>
          <TextField.Root
            mt="1"
            placeholder="Note: how this section connects (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Box>
      ) : null}

      <Flex gap="2" mt="3">
        <Button
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            props.onPick({
              slug: selected.slug,
              domain: selected.domain,
              title: selected.title,
              note: note.trim().length > 0 ? note.trim() : null,
            });
          }}
        >
          Connect{selected ? ` to "${selected.title}"` : ""}
        </Button>
        <Button variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
      </Flex>
    </Box>
  );
}
