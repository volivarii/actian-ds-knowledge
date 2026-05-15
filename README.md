# actian-ds-knowledge

Actian Design System knowledge layer — tokens, components, guidelines, foundations, content. Single source of truth, consumed by the [Actian DS Claude plugin](https://github.com/volivarii/Actian-DS-Claude-plugin) and (future) docs site.

> **Federation status (2026-05-15):** Phase 1 complete. v0.10.0 ships sub-bucketed `content/src/`, extended `_meta.yml` schema, and a generated `MAP.md` orientation doc. Currently lives at `volivarii/actian-ds-knowledge`; transfers to Actian org at trigger conditions (formal team adoption / cross-team consumption / external publication).

## I want to…

| I want to… | Go here |
|---|---|
| **Author content guidelines** (writing rules, UX-pattern copy, product-surface copy) | [`content/src/AUTHORING.md`](content/src/AUTHORING.md) |
| **Author foundations** (tokens, scales, primitives) | [`foundations/src/AUTHORING.md`](foundations/src/AUTHORING.md) |
| **Author per-component guidelines** (anatomy, behavior, usage, tokens, content) | [`components/src/AUTHORING.md`](components/src/AUTHORING.md) |
| **See what's in the repo** | [`MAP.md`](MAP.md) — auto-generated orientation map |
| **Check coverage / debt** | [`components/dist/guidelines/coverage.md`](components/dist/guidelines/coverage.md) |
| **Use this from code / build a consumer** | [`paths-manifest.json`](paths-manifest.json) — the contract. See [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) for AI-agent guides. |
| **Understand the architecture** | [`CONTRIBUTING.md`](CONTRIBUTING.md) — src/+dist/ convention, manifest indirection, CI flows |
| **Index for AI agents** | [`llms.txt`](llms.txt) |

## Versioning

Semver via `package.json#version`. Patch = Figma/foundation data; minor = structural change (breaking manifest contract). Current: **v0.10.0**.

Downstream consumers pin a semver range in their `vendored.json`:
- `~0.10.0` — auto-pull v0.10.x (patches; safe for nightly cron)
- Major/minor jumps require human consent

## Consumers

- **Actian DS Claude plugin** — vendors a pinned snapshot nightly (`vendor-snapshot.yml`). Resolves tag via semver range. No runtime network dependency.
- **Docs site** (in development) — same manifest, separate build pipeline.
- **External / future AI agents** — `.md` URLs + `llms.txt` (next phase).

## License

See [`LICENSE.txt`](LICENSE.txt).
