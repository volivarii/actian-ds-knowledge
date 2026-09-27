// The rail's pointer to Connections on files that are part of a record rather
// than the record itself. A component's guidance file links to the component
// page, which holds the whole section, and lists the links in this file. An
// accessibility file lists its sections that have connections (a section is a
// heading, `{#slug}`, and a graph node), each opening a read-only dialog.
import React, { useMemo, useState } from "react";
import { Dialog } from "@radix-ui/themes";
import { bakedGraphIndex } from "../../substrate/graphIndex";
import { candidateNodeIdForFile } from "../../substrate/nodeIdForFile";
import { navTargetForNodeId } from "../../substrate/navTargetForNodeId";
import { buildConnections, countConnections } from "../../lib/connections/build";
import { linkedSlugs } from "../../lib/connections/bodyLinks";
import { cleanTitle } from "../../lib/referenceCard";
import type { ConnectionsModel } from "../../lib/connections/types";
import { ConnectionChip } from "./ConnectionChip";
import { ConnectionsSection } from "./ConnectionsSection";

const ANCHOR = /\{#([a-z0-9][a-z0-9-]*)\}/g;

export function ConnectionsSummary(props: { path: string; text: string; onNavigate: (target: string) => void }) {
  const index = bakedGraphIndex();
  const nodeId = candidateNodeIdForFile(props.path);
  const go = (id: string) => {
    const t = navTargetForNodeId(id);
    if (t) props.onNavigate(t);
  };

  const isGuidance = !!nodeId?.startsWith("component:") && props.path.endsWith(".md");
  const isA11y = !!nodeId?.startsWith("a11y:");

  const mentions = useMemo(
    () =>
      isGuidance
        ? linkedSlugs(props.text).map((s) => ({ s, node: index.node(`component:${s}`) }))
        : [],
    [isGuidance, props.text, index],
  );
  const sections = useMemo(() => {
    if (!isA11y) return [];
    const out: ConnectionsModel[] = [];
    const seen = new Set<string>();
    for (const m of props.text.matchAll(ANCHOR)) {
      const id = `a11y:${m[1]!}`;
      if (seen.has(id) || !index.node(id)) continue;
      seen.add(id);
      const model = buildConnections({ nodeId: id, index });
      if (countConnections(model) > 0) out.push(model);
    }
    return out;
  }, [isA11y, props.text, index]);
  const [open, setOpen] = useState<ConnectionsModel | null>(null);

  if (!nodeId || !index.node(nodeId)) return null;

  if (isGuidance) {
    const name = cleanTitle(index.node(nodeId)!.title);
    return (
      <div className="cx-summary">
        <p className="cx-sub">
          {name}'s connections are on its page.{" "}
          <button
            type="button"
            className="cx-more"
            aria-label={`Open ${name}'s connections`}
            onClick={() => go(nodeId)}
          >
            Open
          </button>
        </p>
        {mentions.length > 0 && (
          <>
            <p className="cx-sub">Linked from this file</p>
            <div className="cx-items">
              {mentions.map(({ s, node }) => (
                <ConnectionChip
                  key={s}
                  selected={false}
                  onSelect={() => node && go(node.id)}
                  item={{
                    key: s,
                    slug: s,
                    nodeId: node?.id ?? null,
                    title: node ? cleanTitle(node.title) : s,
                    type: node?.type ?? "unknown",
                    state: node ? "saved" : "notInGraph",
                    reciprocal: null,
                    unlinked: false,
                    source: "text",
                    status: "confirmed",
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  if (!isA11y || sections.length === 0) return null;
  return (
    <div className="cx-summary">
      <p className="cx-sub">Sections with connections</p>
      <div className="cx-items">
        {sections.map((m) => {
          const n = countConnections(m);
          return (
            <button
              key={m.nodeId}
              type="button"
              className="cx-chip"
              aria-label={`${m.name}, ${n} connections`}
              onClick={() => setOpen(m)}
            >
              <span className="cx-t">{m.name}</span>
              <span className="cx-flag">{n}</span>
            </button>
          );
        })}
      </div>
      <Dialog.Root open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <Dialog.Content maxWidth="900px">
          <Dialog.Title>{open?.name}</Dialog.Title>
          <Dialog.Description size="2" color="gray">
            What links to this section and what it links to.
          </Dialog.Description>
          {open && (
            <ConnectionsSection
              model={open}
              file={props.path}
              onOpen={(id) => {
                setOpen(null);
                go(id);
              }}
              canOpen={(id) => navTargetForNodeId(id) !== null}
            />
          )}
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}
