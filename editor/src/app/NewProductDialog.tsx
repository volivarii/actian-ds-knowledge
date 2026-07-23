// Create a product in the application-context layer.
//
// The dialog is where the common-vs-context boundary becomes visible. Naming a
// product and giving it a header and navigation is entirely the team's own
// business. Reusing a feature or an entity that other products already depend
// on is not: that write lands in a shared file. Both happen in one pull
// request, and the dialog says plainly which is which rather than hiding the
// second behind the first.

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
import type { ContextRecord } from "../lib/contextRecords";
import { SLUG_RE, slugFromLabel } from "../lib/slugFromLabel";

export interface NewProductValue {
  label: string;
  slug: string;
  headerType: string;
  /** Existing records this product joins; each one is an edit to that file. */
  claim: ContextRecord[];
}

export interface NewProductDialogProps {
  open: boolean;
  /** Slugs of the products that already exist. */
  existingSlugs: string[];
  records: ContextRecord[];
  onConfirm: (value: NewProductValue) => void;
  onCancel: () => void;
}

const KIND_LABEL: Record<ContextRecord["kind"], string> = {
  entity: "Entity",
  feature: "Feature",
};

/** "Studio", "Studio and Explorer", "Studio, Explorer and Administration". */
function joinProducts(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function NewProductDialog({
  open,
  existingSlugs,
  records,
  onConfirm,
  onCancel,
}: NewProductDialogProps) {
  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [headerType, setHeaderType] = useState("");
  const [headerTouched, setHeaderTouched] = useState(false);
  const [filter, setFilter] = useState("");
  const [claimed, setClaimed] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!open) {
      setLabel("");
      setSlug("");
      setSlugTouched(false);
      setHeaderType("");
      setHeaderTouched(false);
      setFilter("");
      setClaimed(new Set());
    }
  }, [open]);

  useEffect(() => {
    if (!slugTouched) setSlug(slugFromLabel(label));
    if (!headerTouched) setHeaderType(label);
  }, [label, slugTouched, headerTouched]);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((r) => r.label.toLowerCase().includes(needle));
  }, [records, filter]);

  const claimedRecords = useMemo(
    () => records.filter((r) => claimed.has(r.path)),
    [records, claimed],
  );
  const sharedClaims = claimedRecords.filter((r) => r.usedBy.length > 0);
  const dependingProducts = joinProducts([
    ...new Set(sharedClaims.flatMap((r) => r.usedBy)),
  ]);

  const trimmedLabel = label.trim();
  const validShape = SLUG_RE.test(slug);
  const collides = existingSlugs.includes(slug);
  const canSubmit = trimmedLabel.length > 0 && validShape && !collides;

  function toggle(path: string) {
    setClaimed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <Dialog.Content style={{ maxWidth: 560 }}>
        <Dialog.Title>New product</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="3">
          A product is your app&apos;s own context: what it is, who uses it, and
          the features and entities it works with. It sits alongside the design
          system rather than inside it.
        </Dialog.Description>

        <Flex direction="column" gap="3">
          <label>
            <Text as="div" size="2" mb="1" weight="bold">
              Product name
            </Text>
            <TextField.Root
              autoFocus
              aria-label="Product name"
              value={label}
              placeholder="Data Connect"
              onChange={(e) => setLabel(e.currentTarget.value)}
            />
          </label>

          <Flex gap="3" wrap="wrap">
            <Box style={{ flex: "1 1 220px" }}>
              <label>
                <Text as="div" size="2" mb="1" weight="bold">
                  Filename
                </Text>
                <TextField.Root
                  aria-label="Filename"
                  value={slug}
                  placeholder="data-connect"
                  onChange={(e) => {
                    setSlug(e.currentTarget.value);
                    setSlugTouched(true);
                  }}
                />
              </label>
              <Text size="1" color="gray" mt="1" data-testid="new-product-path">
                {`app-context/src/apps/${slug || "<slug>"}.md`}
              </Text>
              {trimmedLabel.length > 0 && !validShape && (
                <Text as="p" size="1" color="red" mt="1">
                  {slug.length === 0
                    ? "Filename must start with a lowercase letter."
                    : "Lowercase letters, digits, and hyphens only."}
                </Text>
              )}
              {collides && (
                <Text as="p" size="1" color="red" mt="1">
                  A product with that name already exists.
                </Text>
              )}
            </Box>

            <Box style={{ flex: "1 1 220px" }}>
              <label>
                <Text as="div" size="2" mb="1" weight="bold">
                  Header variant
                </Text>
                <TextField.Root
                  aria-label="Header variant"
                  value={headerType}
                  placeholder="Data Connect"
                  onChange={(e) => {
                    setHeaderType(e.currentTarget.value);
                    setHeaderTouched(true);
                  }}
                />
              </label>
              <Text size="1" color="gray" mt="1" as="div">
                Which global-header variant the product renders.
              </Text>
            </Box>
          </Flex>

          <Box>
            <Text as="div" size="2" weight="bold" mb="1">
              Features and entities it uses
            </Text>
            <Text as="div" size="1" color="gray" mb="2">
              Optional, and you can add more later. Shown as of the last merge.
            </Text>
            <TextField.Root
              aria-label="Filter features and entities"
              placeholder="Filter"
              value={filter}
              mb="2"
              onChange={(e) => setFilter(e.currentTarget.value)}
            />
            <ScrollArea
              type="auto"
              scrollbars="vertical"
              style={{ maxHeight: 200 }}
            >
              <Flex direction="column" gap="1" pr="3">
                {visible.map((r) => (
                  <Flex key={r.path} align="center" gap="2" asChild>
                    <label>
                      <Checkbox
                        aria-label={`${r.label} (${KIND_LABEL[r.kind]})`}
                        checked={claimed.has(r.path)}
                        onCheckedChange={() => toggle(r.path)}
                      />
                      <Text size="2">{r.label}</Text>
                      <Badge size="1" variant="soft" color="gray">
                        {KIND_LABEL[r.kind]}
                      </Badge>
                      <Text size="1" color="gray">
                        {r.usedBy.length > 0
                          ? `used by ${r.usedBy.join(", ")}`
                          : "not used by any product yet"}
                      </Text>
                    </label>
                  </Flex>
                ))}
                {visible.length === 0 && (
                  <Text size="1" color="gray">
                    Nothing matches that filter.
                  </Text>
                )}
              </Flex>
            </ScrollArea>
          </Box>

          {sharedClaims.length > 0 && (
            <Callout.Root
              color="amber"
              size="1"
              role="status"
              data-testid="shared-write-disclosure"
            >
              <Callout.Text>
                {sharedClaims.length === 1
                  ? "1 of these is shared. "
                  : `${sharedClaims.length} of these are shared. `}
                {dependingProducts} already{" "}
                {sharedClaims.length === 1 ? "depends" : "depend"} on{" "}
                {sharedClaims.length === 1 ? "it" : "them"}, so this pull
                request edits files those products rely on and gets reviewed
                with them.
              </Callout.Text>
            </Callout.Root>
          )}
        </Flex>

        <Flex gap="2" justify="end" mt="4">
          <Button variant="soft" color="gray" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() =>
              onConfirm({
                label: trimmedLabel,
                slug,
                headerType: headerType.trim() || trimmedLabel,
                claim: claimedRecords,
              })
            }
          >
            Create product
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
