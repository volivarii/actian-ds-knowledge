// Canonical render loader: turns one component's entry in the render dist
// (components/render/dist, CI-derived by scripts/render/derive-canonical.js)
// into a complete HTML document the editor can show in a sandboxed frame.
//
// The dist is deduplicated on purpose: one shared stylesheet, one fonts sheet,
// one page framing, and a bare fragment per component. A consumer re-assembles
// them. This is the editor's assembly, in the same cascade order as
// build-bundle's selfContainedCard (fonts, stylesheet, page framing last), and
// it reads the same files every other consumer reads, so what the author sees
// here is what ships. Nothing here is a copy of the derive's constants.
//
// The manifest, the stylesheet and the fonts are read once per client and
// kept for five minutes (memoizeByInstance, like every other editor loader),
// so a derive that lands mid-session reaches the panel within the TTL and a
// new fragment is never paired with a stale stylesheet for the tab's lifetime.
// Fragments are read per call. The version comes from the freshness oracle
// the header chip already shows, so the two labels cannot disagree.
import type { Octokit } from "@octokit/rest";
import { getTextFile } from "../app/githubApi";
import { memoizeByInstance } from "./memoizeByInstance";
import { loadFreshness } from "./freshness";
import { resolveCurrentSlug } from "./identityLedger";

export const RENDER_DIST = "components/render/dist";

interface RenderManifest {
  schemaVersion: string;
  css: string;
  fontsCss: string;
  /** Page framing as CSS text; absent on a dist older than manifest 1.2.0. */
  pageCss?: string;
  renders: { slug: string; fragment: string }[];
}

export type CanonicalRender =
  | {
      kind: "rendered";
      /** A complete `<!doctype html>` document for an iframe `srcdoc`. */
      html: string;
      /** knowledge_version the files were read at; null when unreadable. */
      version: string | null;
    }
  | {
      kind: "absent";
      /** How many components the manifest lists a render for. */
      rendered: number;
    };

// The frame reports its content height to the parent so the panel can fit it
// instead of guessing a fixed height. It measures the BODY box: the root's
// scrollHeight is never smaller than the frame's own viewport, so once the
// frame had grown it could never shrink back. It OBSERVES both the root and
// the body: at `load` a freshly inserted sandboxed frame has no layout yet and
// every box measures 0, and only the root's resize (0 to the viewport) is
// guaranteed to fire once layout lands; the body's own resize then covers
// content that grows or shrinks afterwards. Seen 2026-09-02: body-only
// observation posted 0 once and never again, and the frame stayed at its
// minimum height. The frame is sandboxed without same-origin, so postMessage
// is the only channel and its origin is opaque; the panel matches on the
// frame's own contentWindow, not on origin, and ignores a 0.
export const RENDER_HEIGHT_MESSAGE = "ds-render-height";
const FIT_SCRIPT =
  "<script>(function(){function post(){parent.postMessage({type:" +
  JSON.stringify(RENDER_HEIGHT_MESSAGE) +
  ",height:Math.ceil(document.body.getBoundingClientRect().height)},\"*\")}" +
  "window.addEventListener(\"load\",post);" +
  "if(window.ResizeObserver){var ro=new ResizeObserver(post);" +
  "ro.observe(document.documentElement);ro.observe(document.body)}" +
  "})()</script>";

async function readText(gh: Octokit, path: string): Promise<string> {
  try {
    return await getTextFile(gh, path);
  } catch (err) {
    const why =
      (err as { status?: number }).status === 404 ? "not found" : (err as Error).message;
    throw new Error(`Could not read ${path}: ${why}`);
  }
}

function parseJson<T>(path: string, text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error(`${path} is not JSON: ${(err as Error).message}`);
  }
}

interface RenderBase {
  manifest: RenderManifest;
  css: string;
  fonts: string;
}

async function fetchRenderBase(gh: Octokit): Promise<RenderBase> {
  const manifestPath = `${RENDER_DIST}/render-manifest.json`;
  const manifest = parseJson<Partial<RenderManifest>>(
    manifestPath,
    await readText(gh, manifestPath),
  );
  if (!Array.isArray(manifest.renders) || !manifest.css || !manifest.fontsCss) {
    throw new Error(`${manifestPath} is not a render manifest (no renders, css or fontsCss)`);
  }
  const [css, fonts] = await Promise.all([
    readText(gh, `${RENDER_DIST}/${manifest.css}`),
    readText(gh, `${RENDER_DIST}/${manifest.fontsCss}`),
  ]);
  return { manifest: manifest as RenderManifest, css, fonts };
}

const loadRenderBase = memoizeByInstance<Octokit, RenderBase>(fetchRenderBase, {
  ttlMs: 5 * 60 * 1000,
});

export async function loadCanonicalRender(
  gh: Octokit,
  slug: string,
): Promise<CanonicalRender> {
  const [base, target] = await Promise.all([
    loadRenderBase(gh),
    resolveCurrentSlug(gh, slug),
  ]);
  const entry = base.manifest.renders.find((r) => r.slug === target);
  if (!entry) return { kind: "absent", rendered: base.manifest.renders.length };

  const [fragment, freshness] = await Promise.all([
    readText(gh, `${RENDER_DIST}/${entry.fragment}`),
    loadFreshness(gh),
  ]);
  const pageCss = typeof base.manifest.pageCss === "string" ? base.manifest.pageCss : "";
  const html =
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<style>${base.fonts}</style><style>${base.css}</style><style>${pageCss}</style>` +
    `</head><body>${fragment}${FIT_SCRIPT}</body></html>`;
  return { kind: "rendered", html, version: freshness.version };
}
