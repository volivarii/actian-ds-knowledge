// Create an entity or a feature in the application-context layer.
//
// The collision case is the point of this dialog, not an error branch it
// tolerates. Entity and feature names are one flat namespace shared by every
// product, so a team naming their "Dataset" will usually find one already
// there, belonging to somebody else's product. Creating a second file would
// split the vocabulary, which is exactly the fragmentation this layer exists to
// prevent. So a taken name is not rejected with a red message: the dialog shows
// what already exists and who uses it, and offers to join that record instead.

import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Callout,
  Checkbox,
  Dialog,
  Flex,
  ScrollArea,
  Text,
  TextField,
} from "@radix-ui/themes";
import type { ContextRecord, GraphPick } from "../lib/contextRecords";
import type { ContextRecordKind } from "../lib/createContextRecord";
import {
  SLUG_MAX_LENGTH,
  isValidSlug,
  slugFromLabel,
} from "../lib/slugFromLabel";

export interface NewContextRecordValue {
  mode: "create" | "join";
  kind: ContextRecordKind;
  slug: string;
  label: string;
  apps: string[];
  components?: string[];
  /** Join only: the record being joined. */
  existing?: ContextRecord;
}

export interface NewContextRecordDialogProps {
  open: boolean;
  kind: ContextRecordKind;
  /** Every record of this kind that already exists, for the collision check. */
  records: ContextRecord[];
  products: GraphPick[];
  components: GraphPick[];
  onConfirm: (value: NewContextRecordValue) => void;
  onCancel: () => void;
}

const KIND_COPY: Record<
  ContextRecordKind,
  { title: string; blurb: string; namePlaceholder: string }
> = {
  entity: {
    title: "New entity",
    blurb:
      "An entity is a thing your product works with: a dataset, a contract, a connection. Name it, say which products use it, and describe it in the page that opens.",
    namePlaceholder: "Data Contract",
  },
  feature: {
    title: "New feature",
    blurb:
      "A feature is something people do in your product: an import wizard, a lineage graph. Name it, say which products have it, and tick the design-system components it is built from.",
    namePlaceholder: "Import wizard",
  },
};

export function NewContextRecordDialog({
  open,
  kind,
  records,
  products,
  components,
  onConfirm,
  onCancel,
}: NewContextRecordDialogProps) {
  const copy = KIND_COPY[kind];
  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [apps, setApps] = useState<ReadonlySet<string>>(new Set());
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!open) {
      setLabel("");
      setSlug("");
      setApps(new Set());
      setPicked(new Set());
      setFilter("");
    }
  }, [open]);

  // The filename is always derived here: this dialog has no filename field, so
  // there is no edited-slug state to preserve.
  useEffect(() => {
    setSlug(slugFromLabel(label));
  }, [label]);

  // Matched across BOTH kinds on purpose. The namespace this dialog protects is
  // one flat list, so an entity called Dataset and a feature called Dataset are
  // the collision, not two unrelated records. Same kind can be joined; a
  // different kind cannot (an entity does not become a feature), so that one is
  // refused rather than offered.
  const clash = useMemo(() => records.find((r) => r.slug === slug), [
    records,
    slug,
  ]);
  const existing = clash?.kind === kind ? clash : undefined;
  const crossKind = clash && clash.kind !== kind ? clash : undefined;

  const visibleComponents = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return components;
    return components.filter((c) => c.label.toLowerCase().includes(needle));
  }, [components, filter]);

  const trimmedLabel = label.trim();
  const validShape = isValidSlug(slug);
  const chosenApps = products
    .filter((p) => apps.has(p.slug))
    .map((p) => p.slug);
  const canSubmit =
    trimmedLabel.length > 0 &&
    validShape &&
    chosenApps.length > 0 &&
    !crossKind;

  function toggle(
    set: ReadonlySet<string>,
    apply: (next: ReadonlySet<string>) => void,
    key: string,
  ) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    apply(next);
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <Dialog.Content style={{ maxWidth: 560 }}>
        <Dialog.Title>{copy.title}</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="3">
          {copy.blurb}
        </Dialog.Description>

        <Flex direction="column" gap="3">
          <label>
            <Text as="div" size="2" mb="1" weight="bold">
              Name
            </Text>
            <TextField.Root
              autoFocus
              aria-label="Name"
              value={label}
              placeholder={copy.namePlaceholder}
              onChange={(e) => setLabel(e.currentTarget.value)}
            />
          </label>
          <Box>
            <Text size="1" color="gray" data-testid="new-record-path">
              {`app-context/src/${kind === "entity" ? "entities" : "patterns"}/${slug || "<slug>"}.md`}
            </Text>
            {trimmedLabel.length > 0 && !validShape && (
              <Text as="p" size="1" color="red" mt="1">
                {slug.length > SLUG_MAX_LENGTH
                  ? `That name is too long: the filename must be ${SLUG_MAX_LENGTH} characters or fewer.`
                  : "Names must start with a letter."}
              </Text>
            )}
          </Box>

          {crossKind && (
            <Callout.Root color="red" size="1" role="alert" data-testid="cross-kind">
              <Callout.Text>
                {crossKind.kind === "entity" ? "An entity" : "A feature"} is
                already called <strong>{crossKind.label}</strong>. Entities and
                features share one set of names, so pick a different one.
              </Callout.Text>
            </Callout.Root>
          )}

          {existing && (
            <Callout.Root
              color="amber"
              size="1"
              role="status"
              data-testid="already-exists"
            >
              <Callout.Text>
                <strong>{existing.label}</strong> already exists
                {existing.pending
                  ? ", staged earlier in this batch"
                  : existing.usedBy.length > 0
                    ? `, used by ${existing.usedBy.join(", ")}`
                    : ", not used by any product yet"}
                . Names are shared across every product, so rather than making a
                second one, add your product to the existing record.
                {!existing.pending && (
                  <>
                    {" "}
                    Its product list is shown as of the last merge, so anything
                    staged in this batch may not appear yet.
                  </>
                )}
              </Callout.Text>
            </Callout.Root>
          )}

          <Box>
            <Text as="div" size="2" weight="bold" mb="1">
              {existing ? "Add it to" : "Products that use it"}
            </Text>
            <Flex direction="column" gap="1">
              {products.map((p) => (
                <Flex key={p.slug} align="center" gap="2" asChild>
                  <label>
                    <Checkbox
                      aria-label={p.label}
                      checked={apps.has(p.slug)}
                      onCheckedChange={() => toggle(apps, setApps, p.slug)}
                    />
                    <Text size="2">{p.label}</Text>
                    {existing?.usedBySlugs.includes(p.slug) && (
                      <Badge size="1" variant="soft" color="gray">
                        already listed
                      </Badge>
                    )}
                  </label>
                </Flex>
              ))}
              {products.length === 0 && (
                <Text size="1" color="gray">
                  No products yet. Create one first.
                </Text>
              )}
            </Flex>
            {trimmedLabel.length > 0 && chosenApps.length === 0 && (
              <Text as="p" size="1" color="red" mt="1">
                Pick at least one product.
              </Text>
            )}
          </Box>

          {kind === "feature" && !existing && (
            <Box>
              <Text as="div" size="2" weight="bold" mb="1">
                Components it is built from
              </Text>
              <Text as="div" size="1" color="gray" mb="2">
                Optional. This is what connects your feature to the design
                system.
              </Text>
              <TextField.Root
                aria-label="Filter components"
                placeholder="Filter"
                value={filter}
                mb="2"
                onChange={(e) => setFilter(e.currentTarget.value)}
              />
              <ScrollArea
                type="auto"
                scrollbars="vertical"
                style={{ maxHeight: 180 }}
              >
                <Flex direction="column" gap="1" pr="3">
                  {visibleComponents.map((c) => (
                    <Flex key={c.slug} align="center" gap="2" asChild>
                      <label>
                        <Checkbox
                          aria-label={c.label}
                          checked={picked.has(c.slug)}
                          onCheckedChange={() =>
                            toggle(picked, setPicked, c.slug)
                          }
                        />
                        <Text size="2">{c.label}</Text>
                      </label>
                    </Flex>
                  ))}
                  {visibleComponents.length === 0 && (
                    <Text size="1" color="gray">
                      {components.length === 0
                        ? "No components in the library yet."
                        : "Nothing matches that filter."}
                    </Text>
                  )}
                </Flex>
              </ScrollArea>
            </Box>
          )}
        </Flex>

        <Flex gap="2" justify="end" mt="4">
          <Button variant="soft" color="gray" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() =>
              onConfirm(
                existing
                  ? {
                      mode: "join",
                      kind,
                      slug,
                      label: existing.label,
                      apps: chosenApps,
                      existing,
                    }
                  : {
                      mode: "create",
                      kind,
                      slug,
                      label: trimmedLabel,
                      apps: chosenApps,
                      components:
                        kind === "feature"
                          ? components
                              .filter((c) => picked.has(c.slug))
                              .map((c) => c.slug)
                          : undefined,
                    },
              )
            }
          >
            {existing ? "Use the existing one" : copy.title}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
