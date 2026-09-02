// The component as the design system draws it, beside the Figma capture it is
// checked against. Both come from files the substrate already ships: the
// render dist (stylesheet + fonts + page framing + one fragment) and the media
// index. The point is not weight, it is that a clamped variant, a bare colour
// or a blank box becomes a visible disagreement in front of the author who
// can fix it, rather than a number in a JSON nobody reads.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Octokit } from "@octokit/rest";
import { Box, Callout, Card, Flex, Grid, Spinner, Text } from "@radix-ui/themes";
import {
  loadCanonicalRender,
  RENDER_HEIGHT_MESSAGE,
  type CanonicalRender,
} from "../lib/loadCanonicalRender";
import { loadMediaPreviewPath } from "../lib/loadMediaIndex";
import { resolveCurrentSlug } from "../lib/identityLedger";
import { getBinaryFileAsDataUrl } from "./githubApi";

export interface CanonicalRenderPanelProps {
  slug: string;
  octokit: Octokit;
}

type Remote<T> =
  | { kind: "loading" }
  | { kind: "ready"; value: T }
  | { kind: "error"; message: string };

/** Settle `promise` into `set`, unless the effect that armed it has ended. */
function track<T>(
  promise: Promise<T>,
  set: (r: Remote<T>) => void,
  isLive: () => boolean,
): void {
  promise.then(
    (value) => isLive() && set({ kind: "ready", value }),
    (err) => isLive() && set({ kind: "error", message: (err as Error).message }),
  );
}

const MIN_FRAME_HEIGHT = 120;
const MAX_FRAME_HEIGHT = 1200;

async function loadCapture(gh: Octokit, slug: string): Promise<string | null> {
  const path = await loadMediaPreviewPath(gh, slug);
  return path ? getBinaryFileAsDataUrl(gh, path) : null;
}

export function CanonicalRenderPanel({ slug, octokit }: CanonicalRenderPanelProps) {
  const [render, setRender] = useState<Remote<CanonicalRender>>({ kind: "loading" });
  const [capture, setCapture] = useState<Remote<string | null>>({ kind: "loading" });
  const [frameHeight, setFrameHeight] = useState(MIN_FRAME_HEIGHT);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let live = true;
    const isLive = () => live;
    setRender({ kind: "loading" });
    setCapture({ kind: "loading" });
    setFrameHeight(MIN_FRAME_HEIGHT);
    // Both derived surfaces file a renamed component under its CURRENT slug
    // while the authored directory keeps the old one, so resolve once, then
    // read both with the same target. The loader resolves too (memoized, no
    // extra request); passing the resolved slug keeps the two reads in step.
    const target = resolveCurrentSlug(octokit, slug);
    track(target.then((t) => loadCanonicalRender(octokit, t)), setRender, isLive);
    track(target.then((t) => loadCapture(octokit, t)), setCapture, isLive);
    return () => {
      live = false;
    };
  }, [octokit, slug]);

  // The frame's document posts its own height (see FIT_SCRIPT in the loader).
  // Match on the frame's contentWindow: a sandboxed srcdoc frame has an opaque
  // origin, so origin is not a usable filter, and any other window's message
  // must be ignored.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const frame = frameRef.current;
      if (!frame || e.source !== frame.contentWindow) return;
      const data = e.data as { type?: unknown; height?: unknown } | null;
      if (!data || data.type !== RENDER_HEIGHT_MESSAGE) return;
      if (typeof data.height !== "number" || !(data.height > 0)) return;
      setFrameHeight(
        Math.min(MAX_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, Math.ceil(data.height))),
      );
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const version =
    render.kind === "ready" && render.value.kind === "rendered" ? render.value.version : null;

  return (
    <Card variant="surface">
      <Grid columns={{ initial: "1", md: "2" }} gap="4" p="3">
        <Column
          title="Canonical render"
          caption={
            <>
              The HTML the plugin and the Claude Design bundle ship for this component
              {version && <>, read at v{version}</>}.
            </>
          }
          remote={render}
          noun="render"
        >
          {(value) =>
            value.kind === "absent" ? (
              <Callout.Root color="gray" size="1">
                <Callout.Text>
                  No canonical render for <code>{slug}</code> yet. {value.rendered} components
                  have one.
                </Callout.Text>
              </Callout.Root>
            ) : (
              <iframe
                ref={frameRef}
                title={`Canonical render of ${slug}`}
                sandbox="allow-scripts"
                srcDoc={value.html}
                style={{
                  display: "block",
                  width: "100%",
                  height: frameHeight,
                  border: "1px solid var(--gray-a5)",
                  borderRadius: 6,
                  background: "#fff",
                }}
              />
            )
          }
        </Column>
        <Column
          title="Figma capture"
          caption="What Figma publishes. Where the two disagree, the render is what needs fixing."
          remote={capture}
          noun="capture"
        >
          {(src) =>
            src === null ? (
              <Callout.Root color="gray" size="1">
                <Callout.Text>No Figma capture for this component.</Callout.Text>
              </Callout.Root>
            ) : (
              <img
                src={src}
                alt={`Figma capture of ${slug}`}
                style={{
                  display: "block",
                  maxWidth: "100%",
                  border: "1px solid var(--gray-a5)",
                  borderRadius: 6,
                  background: "#fff",
                }}
              />
            )
          }
        </Column>
      </Grid>
    </Card>
  );
}

interface ColumnProps<T> {
  title: string;
  caption: ReactNode;
  remote: Remote<T>;
  /** Names the thing in "Loading …" and "Could not load the …". */
  noun: string;
  children: (value: T) => ReactNode;
}

function Column<T>({ title, caption, remote, noun, children }: ColumnProps<T>) {
  return (
    <Box>
      <Text size="2" weight="medium" as="div">
        {title}
      </Text>
      <Text size="1" color="gray" as="p" mb="2">
        {caption}
      </Text>
      {remote.kind === "loading" && (
        <Flex align="center" gap="2">
          <Spinner />
          <Text size="2" color="gray">
            Loading {noun}…
          </Text>
        </Flex>
      )}
      {remote.kind === "error" && (
        <Callout.Root color="red" size="1">
          <Callout.Text>
            Could not load the {noun}: {remote.message}
          </Callout.Text>
        </Callout.Root>
      )}
      {remote.kind === "ready" && children(remote.value)}
    </Box>
  );
}
