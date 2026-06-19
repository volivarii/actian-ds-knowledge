// RJSF custom widget — generic slug-reference picker for *_refs arrays.
// Domain is supplied per-field via uiSchema `ui:options.refDomain`
// ("accessibility" | "motion" | "foundations"). Value shape:
//   { ref: string; note?: string }[]
// Vocabulary doctrine: render taxonomy TITLES, never the raw slug.
import { useMemo, useState } from "react";
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
import { buildTaxonomyFromAssets } from "../../substrate/buildTaxonomyFromAssets";
import type { Domain } from "../../substrate/taxonomy";
import { TopicResultRow } from "../../app/TopicResultRow";

interface Ref {
  ref: string;
  note?: string;
}

const DOMAIN_LABEL: Record<string, string> = {
  accessibility: "accessibility topics",
  motion: "motion patterns",
  foundations: "foundations",
};

export function RefArrayWidget(props: WidgetProps) {
  const { value, onChange, disabled, readonly, options } = props;
  const domain = ((options?.refDomain as string) ?? "accessibility") as Domain;
  const label = DOMAIN_LABEL[domain] ?? "topics";

  const taxonomy = useMemo(() => buildTaxonomyFromAssets(), []);

  const refs: Ref[] = Array.isArray(value)
    ? value.filter((r): r is Ref => !!r && typeof (r as Ref).ref === "string")
    : [];

  const isDisabled = disabled || readonly;
  const [query, setQuery] = useState("");

  function add(slug: string) {
    if (isDisabled) return;
    if (!refs.some((r) => r.ref === slug)) onChange([...refs, { ref: slug }]);
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

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return taxonomy
      .searchSections(query, { domain, limit: 30 })
      .filter((r) => !refs.some((p) => p.ref === r.slug));
  }, [taxonomy, query, refs, domain]);

  return (
    <Box>
      {refs.length > 0 && (
        <Flex gap="1" wrap="wrap" mb="2">
          {refs.map((r) => {
            const title = taxonomy.getTitle(domain, r.ref) ?? r.ref;
            const tier = taxonomy.getTier(domain, r.ref);
            const tierLabel = tier ? tier.replaceAll("-", " ") : null;
            return (
              <Badge
                key={r.ref}
                color="blue"
                variant="soft"
                size="2"
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                {title}
                {tierLabel && (
                  <Badge size="1" color="gray" variant="soft">
                    {tierLabel}
                  </Badge>
                )}
                {!isDisabled && (
                  <>
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
                          placeholder="Why this applies here…"
                          defaultValue={r.note ?? ""}
                          onBlur={(e) => setNote(r.ref, e.currentTarget.value)}
                        />
                      </Popover.Content>
                    </Popover.Root>
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

      {!isDisabled && (
        <Box style={{ border: "1px solid var(--gray-5)", borderRadius: 6, maxWidth: 480 }}>
          <Command label={`${label} search`} shouldFilter={false}>
            <Command.Input
              placeholder={`Search ${label}…`}
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
            <Command.List style={{ maxHeight: 280, overflowY: "auto", padding: "4px 0" }}>
              {query.trim() === "" ? null : (
                <>
                  <Command.Empty>
                    <Text size="1" color="gray" as="div" style={{ padding: 12 }}>
                      No matches.
                    </Text>
                  </Command.Empty>
                  {results.map((r) => (
                    <Command.Item
                      key={r.slug}
                      value={r.slug}
                      onSelect={() => add(r.slug)}
                      style={{ display: "block", cursor: "pointer", padding: "2px 8px" }}
                    >
                      <TopicResultRow result={r} />
                    </Command.Item>
                  ))}
                </>
              )}
            </Command.List>
          </Command>
        </Box>
      )}
    </Box>
  );
}
