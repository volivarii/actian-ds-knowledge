// The component as the design system draws it, beside the Figma capture it is
// checked against. Both come from files the substrate already ships: the
// render dist (stylesheet + fonts + one fragment) and the media index. The
// point is not weight, it is that a clamped variant, a bare colour or a blank
// box becomes a visible disagreement in front of the author who can fix it,
// rather than a number in a JSON nobody reads.
import { useEffect, useRef, useState } from "react";
import type { Octokit } from "@octokit/rest";
import { Box, Callout, Card, Flex, Grid, Spinner, Text } from "@radix-ui/themes";
import {
  loadCanonicalRender,
  RENDER_HEIGHT_MESSAGE,
  type CanonicalRender,
} from "../lib/loadCanonicalRender";
import { loadMediaPreviewPath } from "../lib/loadMediaIndex";
import { getBinaryFileAsDataUrl } from "./githubApi";

export interface CanonicalRenderPanelProps {
  slug: string;
  octokit: Octokit;
}

type RenderState =
  | { kind: "loading" }
  | { kind: "ready"; value: CanonicalRender }
  | { kind: "error"; message: string };

type CaptureState =
  | { kind: "loading" }
  | { kind: "ready"; src: string | null }
  | { kind: "error"; message: string };

const MIN_FRAME_HEIGHT = 120;
const MAX_FRAME_HEIGHT = 1200;

export function CanonicalRenderPanel({ slug, octokit }: CanonicalRenderPanelProps) {
  const [render, setRender] = useState<RenderState>({ kind: "loading" });
  const [capture, setCapture] = useState<CaptureState>({ kind: "loading" });
  const [frameHeight, setFrameHeight] = useState(MIN_FRAME_HEIGHT);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let live = true;
    setRender({ kind: "loading" });
    setCapture({ kind: "loading" });
    setFrameHeight(MIN_FRAME_HEIGHT);
    loadCanonicalRender(octokit, slug)
      .then((value) => live && setRender({ kind: "ready", value }))
      .catch(
        (err) =>
          live && setRender({ kind: "error", message: (err as Error).message }),
      );
    loadMediaPreviewPath(octokit, slug)
      .then((path) => (path ? getBinaryFileAsDataUrl(octokit, path) : null))
      .then((src) => live && setCapture({ kind: "ready", src }))
      .catch(
        (err) =>
          live && setCapture({ kind: "error", message: (err as Error).message }),
      );
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

  return (
    <Card variant="surface">
      <Grid columns={{ initial: "1", md: "2" }} gap="4" p="3">
        <Box>
          <Text size="2" weight="medium" as="div">
            Canonical render
          </Text>
          <Text size="1" color="gray" as="p" mb="2">
            The HTML the plugin and the Claude Design bundle ship for this
            component
            {render.kind === "ready" && render.value.kind === "rendered" && (
              <>, read at v{render.value.version}</>
            )}
            .
          </Text>
          {render.kind === "loading" && (
            <Flex align="center" gap="2">
              <Spinner />
              <Text size="2" color="gray">
                Loading render…
              </Text>
            </Flex>
          )}
          {render.kind === "error" && (
            <Callout.Root color="red" size="1">
              <Callout.Text>Could not load the render: {render.message}</Callout.Text>
            </Callout.Root>
          )}
          {render.kind === "ready" && render.value.kind === "absent" && (
            <Callout.Root color="gray" size="1">
              <Callout.Text>
                No canonical render for <code>{slug}</code> yet.{" "}
                {render.value.rendered} components have one.
              </Callout.Text>
            </Callout.Root>
          )}
          {render.kind === "ready" && render.value.kind === "rendered" && (
            <iframe
              ref={frameRef}
              title={`Canonical render of ${slug}`}
              sandbox="allow-scripts"
              srcDoc={render.value.html}
              style={{
                display: "block",
                width: "100%",
                height: frameHeight,
                border: "1px solid var(--gray-a5)",
                borderRadius: 6,
                background: "#fff",
              }}
            />
          )}
        </Box>
        <Box>
          <Text size="2" weight="medium" as="div">
            Figma capture
          </Text>
          <Text size="1" color="gray" as="p" mb="2">
            What Figma publishes. Where the two disagree, the render is what
            needs fixing.
          </Text>
          {capture.kind === "loading" && (
            <Flex align="center" gap="2">
              <Spinner />
              <Text size="2" color="gray">
                Loading capture…
              </Text>
            </Flex>
          )}
          {capture.kind === "error" && (
            <Callout.Root color="red" size="1">
              <Callout.Text>Could not load the capture: {capture.message}</Callout.Text>
            </Callout.Root>
          )}
          {capture.kind === "ready" && capture.src === null && (
            <Callout.Root color="gray" size="1">
              <Callout.Text>No Figma capture for this component.</Callout.Text>
            </Callout.Root>
          )}
          {capture.kind === "ready" && capture.src !== null && (
            <img
              src={capture.src}
              alt={`Figma capture of ${slug}`}
              style={{
                display: "block",
                maxWidth: "100%",
                border: "1px solid var(--gray-a5)",
                borderRadius: 6,
                background: "#fff",
              }}
            />
          )}
        </Box>
      </Grid>
    </Card>
  );
}
