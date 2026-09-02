// Canonical render loader: turns one component's entry in the render dist
// (components/render/dist, CI-derived by scripts/render/derive-canonical.js)
// into a complete HTML document the editor can show in a sandboxed frame.
//
// The dist is deduplicated on purpose: one shared stylesheet, one fonts sheet,
// and a bare fragment per component. A consumer re-assembles them. This is the
// editor's assembly, and it reads the same three files every other consumer
// (the plugin, the Claude Design bundle, the docs site) reads, so what the
// author sees here is what ships.
//
// The manifest, the stylesheet, the fonts and the repo version are read once
// per session and shared across components (module memory, not sessionStorage:
// the fonts sheet alone is ~340 KB). Fragments are read per call.
import type { Octokit } from "@octokit/rest";
import { getTextFile } from "../app/githubApi";

export const RENDER_DIST = "components/render/dist";

interface RenderManifest {
  schemaVersion: string;
  css: string;
  fontsCss: string;
  renders: { slug: string; group: string; fragment: string; source?: string }[];
}

export type CanonicalRender =
  | {
      kind: "rendered";
      /** A complete `<!doctype html>` document for an iframe `srcdoc`. */
      html: string;
      group: string;
      fragmentPath: string;
      /** The knowledge repo version the files were read at (package.json). */
      version: string;
    }
  | {
      kind: "absent";
      /** How many components the manifest lists a render for. */
      rendered: number;
    };

// The editor's own page framing for the frame. It is deliberately not the
// derive's PAGE_CSS (that one frames the Claude Design card); render.css
// excludes page chrome so every consumer frames the fragment itself.
const PAGE_CSS = "body{margin:0;padding:16px;background:#fff}";

// The frame reports its content height to the parent so the panel can fit it
// instead of guessing a fixed height. The frame is sandboxed without
// same-origin, so postMessage is the only channel and its origin is opaque;
// the panel matches on the frame's own contentWindow, not on origin.
export const RENDER_HEIGHT_MESSAGE = "ds-render-height";
const FIT_SCRIPT =
  "<script>(function(){function post(){parent.postMessage({type:" +
  JSON.stringify(RENDER_HEIGHT_MESSAGE) +
  ",height:document.documentElement.scrollHeight},\"*\")}" +
  "window.addEventListener(\"load\",post);" +
  "if(window.ResizeObserver){new ResizeObserver(post).observe(document.documentElement)}" +
  "})()</script>";

interface SessionCache {
  manifest?: Promise<RenderManifest>;
  css?: Promise<string>;
  fonts?: Promise<string>;
  version?: Promise<string>;
}
let cache: SessionCache = {};

/** Test seam: forget everything read this session. */
export function resetCanonicalRenderCache(): void {
  cache = {};
}

async function readText(gh: Octokit, path: string): Promise<string> {
  try {
    return await getTextFile(gh, path);
  } catch (err) {
    const why = (err as { status?: number }).status === 404
      ? "not found"
      : (err as Error).message;
    throw new Error(`Could not read ${path}: ${why}`);
  }
}

function once<K extends keyof SessionCache>(
  key: K,
  make: () => NonNullable<SessionCache[K]>,
): NonNullable<SessionCache[K]> {
  const hit = cache[key];
  if (hit) return hit as NonNullable<SessionCache[K]>;
  const p = make();
  cache[key] = p;
  // A failed read must not poison the session: the next call retries.
  (p as Promise<unknown>).catch(() => {
    if (cache[key] === p) delete cache[key];
  });
  return p;
}

function loadManifest(gh: Octokit): Promise<RenderManifest> {
  return once("manifest", async () => {
    const text = await readText(gh, `${RENDER_DIST}/render-manifest.json`);
    const json = JSON.parse(text) as Partial<RenderManifest>;
    if (!Array.isArray(json.renders) || !json.css || !json.fontsCss) {
      throw new Error(
        `${RENDER_DIST}/render-manifest.json is not a render manifest (no renders, css or fontsCss)`,
      );
    }
    return json as RenderManifest;
  });
}

function loadVersion(gh: Octokit): Promise<string> {
  return once("version", async () => {
    const json = JSON.parse(await readText(gh, "package.json")) as {
      version?: string;
    };
    return typeof json.version === "string" ? json.version : "unknown";
  });
}

export async function loadCanonicalRender(
  gh: Octokit,
  slug: string,
): Promise<CanonicalRender> {
  const manifest = await loadManifest(gh);
  const entry = manifest.renders.find((r) => r.slug === slug);
  if (!entry) return { kind: "absent", rendered: manifest.renders.length };

  const fragmentPath = `${RENDER_DIST}/${entry.fragment}`;
  const [fonts, css, fragment, version] = await Promise.all([
    once("fonts", () => readText(gh, `${RENDER_DIST}/${manifest.fontsCss}`)),
    once("css", () => readText(gh, `${RENDER_DIST}/${manifest.css}`)),
    readText(gh, fragmentPath),
    loadVersion(gh),
  ]);

  const html =
    "<!doctype html><html><head><meta charset=\"utf-8\">" +
    `<style>${PAGE_CSS}</style><style>${fonts}</style><style>${css}</style>` +
    `</head><body>${fragment}${FIT_SCRIPT}</body></html>`;
  return { kind: "rendered", html, group: entry.group, fragmentPath, version };
}
