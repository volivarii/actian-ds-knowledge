import { $view } from "@milkdown/utils";
import { htmlSchema } from "@milkdown/preset-commonmark";
import type { Octokit } from "@octokit/rest";
import { getBinaryFileAsDataUrl } from "../../app/githubApi";
import { parseMediaTag, resolveMediaSrc } from "./mediaTag";

// Slug + octokit for preview resolution are provided per-editor via module-level
// setters (the NodeView factory closes over them). No slug, or no octokit
// (e.g. the headless round-trip in tests), means: labeled chip, no image fetch.
let currentSlug: string | null = null;
export function setMediaPreviewSlug(slug: string | null): void {
  currentSlug = slug;
}

let currentOctokit: Octokit | null = null;
export function setMediaPreviewOctokit(octokit: Octokit | null): void {
  currentOctokit = octokit;
}

// Display-only NodeView over the commonmark `html` node. NOTE (confirmed against
// @milkdown/preset-commonmark 7.21.2): the `html` node is an INLINE ATOM that
// stores its raw markup in `node.attrs.value` (`node.textContent` is always ""
// for an atom). So we read `node.attrs.value` (the brief's `node.textContent` was
// written against a hypothetical text-holding node and would never match here).
// The view NEVER mutates attrs, so the toMarkdown runner still emits the original
// <Media …/> verbatim and getMarkdown() stays byte-exact (media-roundtrip test
// enforces this).
export const mediaNodeView = $view(htmlSchema.node, () => (node) => {
  const raw = typeof node.attrs.value === "string" ? node.attrs.value : "";
  const attrs = parseMediaTag(raw);
  const dom = document.createElement("span");
  if (!attrs) {
    dom.textContent = raw; // non-Media html: passthrough, unchanged
    return { dom };
  }
  dom.className = "md-media-chip";
  dom.setAttribute("contenteditable", "false");

  // Render the labeled chip immediately; it stays the fallback for no
  // slug/octokit, a fetch error, or (in tests) the headless round-trip.
  dom.textContent = `Media: ${attrs.role}${attrs.layout ? ` · ${attrs.layout}` : ""}`;

  const slug = currentSlug;
  const octokit = currentOctokit;
  let destroyed = false;
  if (slug && octokit) {
    getBinaryFileAsDataUrl(octokit, resolveMediaSrc(slug, attrs.role))
      .then((dataUrl) => {
        if (destroyed) return; // NodeView was torn down before the fetch resolved
        dom.textContent = "";
        const img = document.createElement("img");
        img.src = dataUrl;
        img.alt = `Media: ${attrs.role}${attrs.layout ? ` (${attrs.layout})` : ""}`;
        img.className = "md-media-chip__img";
        dom.appendChild(img);
      })
      .catch(() => {
        // Missing file, network error, or auth failure: keep the labeled chip.
      });
  }

  return {
    dom,
    destroy: () => {
      destroyed = true;
    },
  };
});
