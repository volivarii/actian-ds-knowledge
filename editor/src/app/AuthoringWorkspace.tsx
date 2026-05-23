// Authoring Workspace — orchestrator for authoring a NEW component.
//
// User reaches the workspace via CoverageDashboard's "Start authoring"
// on a ghost row. The workspace itself is READ-ONLY: opening it does
// not stage anything in the cart. Only a concrete action — "Write X"
// or "Edit metadata" — lazily stages the _meta.yml stub the first time
// it's needed (see workspaceState.promoteDomainToDraft /
// stageMetadataForEdit). This prevents cart pollution from authors who
// open a workspace and leave.
//
// Status per domain is derived from cart/remote state, never picked.

import { useCallback, useEffect, useState } from "react";
import type { Octokit } from "@octokit/rest";
import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Checkbox,
  Flex,
  Heading,
  Spinner,
  Text,
} from "@radix-ui/themes";
import {
  DOMAIN_HINT,
  DOMAIN_LABEL,
  domainPathFor,
  loadWorkspaceState,
  promoteDomainToDraft,
  setDomainInherited,
  stageMetadataForEdit,
  type Domain,
  type WorkspaceDomainStatus,
  type WorkspaceState,
} from "../lib/workspaceState";
import { submissionCartSingleton } from "../drafts/store-instance";
import { useCart } from "../drafts/useCart";

export interface AuthoringWorkspaceProps {
  slug: string;
  octokit: Octokit;
  onNavigate: (path: string) => void;
  onBack: () => void;
}

const STATUS_LABEL: Record<WorkspaceDomainStatus, string> = {
  "not-started": "Not started",
  authored: "Authored — in batch / remote",
  inherited: "Inherited from category",
  approved: "Approved",
};

const STATUS_COLOR: Record<
  WorkspaceDomainStatus,
  "gray" | "amber" | "blue" | "green"
> = {
  "not-started": "gray",
  authored: "amber",
  inherited: "blue",
  approved: "green",
};

export function AuthoringWorkspace({
  slug,
  octokit,
  onNavigate,
  onBack,
}: AuthoringWorkspaceProps) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; value: WorkspaceState }
    | { kind: "error"; message: string }
  >({ kind: "loading" });
  const cartEntries = useCart(submissionCartSingleton);

  const refresh = useCallback(async () => {
    try {
      const next = await loadWorkspaceState(octokit, slug);
      setState({ kind: "ready", value: next });
    } catch (err) {
      setState({ kind: "error", message: (err as Error).message });
    }
  }, [octokit, slug]);

  useEffect(() => {
    void refresh();
  }, [refresh, cartEntries]);

  const onWriteDomain = useCallback(
    async (domain: Domain) => {
      await promoteDomainToDraft(octokit, slug, domain);
      onNavigate(domainPathFor(slug, domain));
    },
    [octokit, slug, onNavigate],
  );

  const onEditMetadata = useCallback(async () => {
    await stageMetadataForEdit(octokit, slug);
    onNavigate(`components/src/${slug}/_meta.yml`);
  }, [octokit, slug, onNavigate]);

  const onToggleInherited = useCallback(
    async (domain: Domain, inherited: boolean) => {
      await setDomainInherited(octokit, slug, domain, inherited);
      await refresh();
    },
    [octokit, slug, refresh],
  );

  if (state.kind === "loading") {
    return (
      <Box p="6">
        <Flex align="center" gap="2">
          <Spinner />
          <Text size="2" color="gray">
            Loading workspace…
          </Text>
        </Flex>
      </Box>
    );
  }

  if (state.kind === "error") {
    return (
      <Box p="6">
        <Callout.Root color="red">
          <Callout.Text>Failed to load workspace: {state.message}</Callout.Text>
        </Callout.Root>
      </Box>
    );
  }

  const ws = state.value;
  const authoredCount = ws.domains.filter(
    (d) => d.status === "authored" || d.status === "approved",
  ).length;

  return (
    <Box p="5" style={{ maxWidth: 980, margin: "0 auto" }}>
      <Flex align="center" justify="between" gap="2" mb="2" wrap="wrap">
        <Box>
          <Text size="1" color="gray" as="div" mb="1">
            <Button variant="ghost" size="1" onClick={onBack}>
              ← Back to coverage
            </Button>
          </Text>
          <Heading size="6">{ws.componentName}</Heading>
          <Text size="2" color="gray" as="div">
            {ws.category && <>category: {ws.category} · </>}
            slug: <code>{slug}</code>
            {!ws.metaOnRemote && (
              <>
                {" · "}
                <Badge color="amber" variant="soft" size="1">
                  New component
                </Badge>
              </>
            )}
            {ws.metaInCart && (
              <>
                {" · "}
                <Badge color="indigo" variant="soft" size="1">
                  Metadata in batch
                </Badge>
              </>
            )}
          </Text>
        </Box>
      </Flex>

      <Callout.Root color="blue" size="1" mb="3">
        <Callout.Text>
          <strong>Progress:</strong> {authoredCount} of {ws.domains.length}{" "}
          domains authored
          {ws.cartEntries.length > 0 && (
            <>
              {" "}
              · <strong>{ws.cartEntries.length}</strong> file
              {ws.cartEntries.length === 1 ? "" : "s"} staged for this component
            </>
          )}
        </Callout.Text>
      </Callout.Root>

      <Heading size="3" mt="4" mb="2">
        Authoring tasks
      </Heading>
      <Text size="1" color="gray" as="p" mb="3">
        Each domain below is one guidance file in this component's folder. Click{" "}
        <em>Write</em> to draft it — the metadata stages itself automatically
        the first time.
      </Text>

      <Flex direction="column" gap="2">
        {ws.domains.map((d) => (
          <DomainCard
            key={d.domain}
            domain={d.domain}
            status={d.status}
            hasCartMd={d.hasCartMd}
            slug={slug}
            onWrite={() => onWriteDomain(d.domain)}
            onOpen={() => onNavigate(domainPathFor(slug, d.domain))}
            onToggleInherited={(inherited) =>
              onToggleInherited(d.domain, inherited)
            }
          />
        ))}
      </Flex>

      <Heading size="3" mt="5" mb="2">
        Metadata
      </Heading>
      <Card variant="surface">
        <Flex align="center" justify="between" p="3" gap="3">
          <Box>
            <Text size="2" weight="medium" as="div">
              {ws.componentName} — registry-aligned metadata
            </Text>
            <Text size="1" color="gray" as="div">
              Component name + category were auto-filled from the registry. Edit
              only if you need to set related slugs, examples, or lastReviewed.
            </Text>
          </Box>
          <Button
            variant="outline"
            size="2"
            onClick={() => void onEditMetadata()}
          >
            Edit metadata →
          </Button>
        </Flex>
      </Card>
    </Box>
  );
}

interface DomainCardProps {
  domain: Domain;
  status: WorkspaceDomainStatus;
  hasCartMd: boolean;
  slug: string;
  onWrite: () => void | Promise<void>;
  onOpen: () => void;
  onToggleInherited: (inherited: boolean) => void | Promise<void>;
}

function DomainCard({
  domain,
  status,
  hasCartMd,
  onWrite,
  onOpen,
  onToggleInherited,
}: DomainCardProps) {
  const label = DOMAIN_LABEL[domain];
  const hint = DOMAIN_HINT[domain];
  const isAuthored = status === "authored" || status === "approved";
  const isInherited = status === "inherited";
  // Inherited intent is mutually exclusive with authoring a file —
  // disable the checkbox once the file is in cart/remote to prevent
  // declaring "no file needed" while a file is being staged.
  const inheritedDisabled = isAuthored || hasCartMd;

  return (
    <Card variant="surface">
      <Flex align="center" justify="between" p="3" gap="3">
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Flex align="center" gap="2" mb="1">
            <Text size="3" weight="medium">
              {label}
            </Text>
            <Badge color={STATUS_COLOR[status]} variant="soft" size="1">
              {STATUS_LABEL[status]}
            </Badge>
            {hasCartMd && (
              <Badge color="indigo" variant="soft" size="1">
                In batch
              </Badge>
            )}
          </Flex>
          <Text size="1" color="gray" as="div" mb="2">
            {hint}
          </Text>
          <Text
            size="1"
            color={inheritedDisabled ? "gray" : undefined}
            as="label"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              cursor: inheritedDisabled ? "not-allowed" : "pointer",
            }}
          >
            <Checkbox
              checked={isInherited}
              disabled={inheritedDisabled}
              onCheckedChange={(checked) =>
                void onToggleInherited(checked === true)
              }
            />
            Use category default — don't author this domain
          </Text>
        </Box>
        <Flex gap="2" align="center">
          {isAuthored ? (
            <Button variant="outline" size="2" onClick={onOpen}>
              Edit {label} →
            </Button>
          ) : status === "inherited" ? (
            <Text size="1" color="gray">
              No file needed
            </Text>
          ) : (
            <Button size="2" onClick={() => void onWrite()}>
              Write {label} →
            </Button>
          )}
        </Flex>
      </Flex>
    </Card>
  );
}
