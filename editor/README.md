# Knowledge Editor

> **Zone: Tooling.** This is build machinery (the knowledge Editor app), not consumed substrate. Consumers never read this folder. See [`../ARCHITECTURE.md`](../ARCHITECTURE.md).

Schema-driven editor for the `actian-ds-knowledge` substrate. Authors edit the canonical files (tokens, foundations, components, accessibility, app-context, icon-groups) through forms + rich-text + live preview, and the editor packages each change as a Pull Request against `main`. In the UI the app-context domain surfaces under **Application context** (Products / Entities / Patterns), separate from the **Design system** sections (where Content nests Writing rules, Patterns, and Product). The two Patterns sections are told apart by their parent, which is also how a reader does it.

Built as a static SPA, deployed from this repo's own GitHub Pages. Zero recurring cost, no third-party hosting.

## Dev

```bash
npm install
npm run dev      # boots Vite on http://localhost:5173/
npm test         # runs node --test under tsx
npm run build    # production build to dist/
```

## Architecture

Four isolated units:
- **Form-engine** — RJSF + uiSchemas + serializer round-trips.
- **Commit-PR core** — read-only-path refusal, schema validation, GitHub branch/tree/commit/PR pipeline.
- **Draft inbox** — local pending changes before submission.
- **Settings / PAT vault** — token storage in `localStorage`.

Every user-visible word for a Thing, a State, an Action or a Link is declared in
[`src/lib/nomenclature.ts`](src/lib/nomenclature.ts) and nowhere else — one word per concept, no
synonyms. Add a label anywhere else and the vocabulary starts drifting again, which is how one state
came to read "Approved" on one screen and "ready" on the next.

UI schemas live in `src/uiSchemas/` — **never** in `schemas/`. Doctrine P3: the schemas are the published contract; presentation hints (labels, ordering, help text) belong to the consumer.

See the design spec: `actian-design-system-plugin/plugins/actian-design-system/docs/superpowers/specs/2026-05-23-knowledge-editor-phase-1-design.md`

New to the relations concept (links, frontmatter refs, the Graph tab)? Read [`../RELATIONS.md`](../RELATIONS.md) first.
