// A compact draft⇄approved status toggle for a component's prose domain file,
// mounted in the MarkdownEditScreen header. Reads the declared status from the
// sibling _meta.yml (cart-wins → remote) and stages a change through the
// setDomainStatus choke-point. Presentational only; the PR merge is the actual
// approval gate. Renders nothing while the initial read is in flight.

import { useEffect, useState } from "react";
import type { Octokit } from "@octokit/rest";
import { Badge, Button, Flex, Text } from "@radix-ui/themes";
import {
  readDeclaredStatus,
  setDomainStatus,
  type Domain,
} from "../lib/workspaceState";

interface DomainStatusControlProps {
  slug: string;
  domain: Domain;
  octokit: Octokit;
}

type View = "loading" | "draft" | "approved" | "error";

export function DomainStatusControl({
  slug,
  domain,
  octokit,
}: DomainStatusControlProps) {
  const [view, setView] = useState<View>("loading");
  const [staged, setStaged] = useState(false);
  const [busy, setBusy] = useState(false);

  // Props (slug/domain) drive the read — no DOM ref, so this is immune to the
  // Spinner→ready ref-timing bug class (see PR #437). Cleanup guards setState
  // after unmount / file-switch.
  useEffect(() => {
    let alive = true;
    setView("loading");
    setStaged(false);
    (async () => {
      try {
        const declared = await readDeclaredStatus(octokit, slug, domain);
        if (!alive) return;
        setView(declared === "approved" ? "approved" : "draft");
      } catch {
        if (alive) setView("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [octokit, slug, domain]);

  const flip = async (next: "draft" | "approved") => {
    setBusy(true);
    try {
      await setDomainStatus(octokit, slug, domain, next);
      setView(next);
      setStaged(true);
    } catch {
      setView("error");
    } finally {
      setBusy(false);
    }
  };

  if (view === "loading") return null;
  if (view === "error") {
    return (
      <Text size="1" color="ruby">
        Status unavailable
      </Text>
    );
  }

  return (
    <Flex align="center" gap="2">
      {view === "approved" ? (
        <>
          <Badge color="green" variant="soft">
            Approved
          </Badge>
          <Button
            size="1"
            variant="ghost"
            color="gray"
            disabled={busy}
            onClick={() => void flip("draft")}
            title="Return this domain to draft (ships on the next PR)"
          >
            Return to draft
          </Button>
        </>
      ) : (
        <>
          <Badge color="amber" variant="soft">
            Draft
          </Badge>
          <Button
            size="1"
            variant="soft"
            disabled={busy}
            onClick={() => void flip("approved")}
            title="Mark this domain approved (stages _meta.yml; ships on the next PR)"
          >
            Mark approved
          </Button>
        </>
      )}
      {staged && (
        <Text size="1" color="grass">
          ✓ staged, ships on next PR
        </Text>
      )}
    </Flex>
  );
}
