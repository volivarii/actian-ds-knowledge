// RJSF custom widget — free-text tag chips for an open-ended string[].
// Modeled on RelatedMultiSelectWidget's chip block, minus the closed-vocabulary
// typeahead: authors type any word and press Enter to add it.
import { useState } from "react";
import type { WidgetProps } from "@rjsf/utils";
import { Badge, Box, Button, Flex } from "@radix-ui/themes";

export function TagInputWidget(props: WidgetProps) {
  const { value, onChange, disabled, readonly } = props;
  const [draft, setDraft] = useState("");
  const isDisabled = disabled || readonly;
  const tags: string[] = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];

  function addTag() {
    const t = draft.trim();
    if (!t || isDisabled) return;
    if (!tags.includes(t)) onChange([...tags, t]);
    setDraft("");
  }
  function remove(tag: string) {
    if (isDisabled) return;
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <Box>
      {tags.length > 0 && (
        <Flex gap="1" wrap="wrap" mb="2">
          {tags.map((tag) => (
            <Badge
              key={tag}
              color="indigo"
              variant="soft"
              size="2"
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              {tag}
              {!isDisabled && (
                <Button
                  variant="ghost"
                  size="1"
                  color="gray"
                  aria-label={`Remove ${tag}`}
                  onClick={() => remove(tag)}
                  style={{ padding: 0, minWidth: 0, lineHeight: 1 }}
                >
                  ✕
                </Button>
              )}
            </Badge>
          ))}
        </Flex>
      )}
      {!isDisabled && (
        <input
          placeholder="Type a word and press Enter…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          style={{
            width: "100%",
            maxWidth: 320,
            padding: "8px 12px",
            border: "1px solid var(--gray-5)",
            borderRadius: 6,
            outline: "none",
            background: "transparent",
            fontSize: 13,
          }}
        />
      )}
    </Box>
  );
}
