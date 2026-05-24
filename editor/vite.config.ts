import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Manual chunk routing — keep the largest libraries in their own
// chunks so first-load cost is split + downstream cache invalidation
// is scoped. Pre-split bundle was ~1.5 MB single JS chunk.
//
// Each grouping is "big enough to warrant its own cache lane and
// changes on a different cadence than the editor app code itself".
function chunkFor(id: string): string | undefined {
  if (!id.includes("node_modules")) return undefined;
  // React must be checked FIRST — it's transitively imported by Radix,
  // RJSF, content-tools, and several vendor packages. Routing their
  // chunks before React produces vendor ↔ chunk circular references.
  if (
    id.includes("/react/") ||
    id.includes("/react-dom/") ||
    id.includes("/scheduler/")
  )
    return "react";
  if (id.includes("@codemirror") || id.includes("@lezer")) return "codemirror";
  if (
    id.includes("@rjsf") ||
    id.includes("/ajv/") ||
    id.includes("/ajv-formats/")
  )
    return "rjsf";
  if (id.includes("@radix-ui")) return "radix";
  if (id.includes("@octokit")) return "octokit";
  if (
    id.includes("react-markdown") ||
    id.includes("remark") ||
    id.includes("rehype") ||
    id.includes("/yaml/") ||
    id.includes("cmdk")
  ) {
    return "content-tools";
  }
  return "vendor";
}

export default defineConfig({
  plugins: [react()],
  base: process.env.EDITOR_BASE_PATH ?? "/",
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: { manualChunks: chunkFor },
    },
  },
});
