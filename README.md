# actian-ds-knowledge

Actian Design System knowledge layer — tokens, components, guidelines, foundations, content. Single source of truth, consumed by the [Actian DS Claude plugin](https://github.com/volivarii/Actian-DS-Claude-plugin) and (future) docs site.

> **Federation status:** Active. Hosts foundations, per-component multi-domain guidelines, content, accessibility, tokens, and CI-derived media assets. Consumed by the [Actian DS Claude plugin](https://github.com/volivarii/Actian-DS-Claude-plugin) (vendor-pinned, nightly refresh) and (future) docs site. Currently at `volivarii/actian-ds-knowledge`; transfers to Actian org at trigger conditions (formal team adoption / cross-team consumption / external publication).

## I want to…

| I want to… | Go here |
|---|---|
| **Author content guidelines** (writing rules, UX-pattern copy, product-surface copy) | [`content/src/AUTHORING.md`](content/src/AUTHORING.md) |
| **Author foundations** (tokens, scales, primitives) | [`foundations/src/AUTHORING.md`](foundations/src/AUTHORING.md) |
| **Author per-component guidelines** (anatomy, behavior, usage, tokens, content) | [`components/src/AUTHORING.md`](components/src/AUTHORING.md) |
| **See what's in the repo** | [`paths-manifest.json`](paths-manifest.json) — every artifact, keyed and described |
| **Check coverage / debt** | [`components/dist/guidelines/coverage.md`](components/dist/guidelines/coverage.md) |
| **Use this from code / build a consumer** | [`paths-manifest.json`](paths-manifest.json) — the contract. See [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) for AI-agent guides. |
| **Understand the architecture** | [`CONTRIBUTING.md`](CONTRIBUTING.md) — src/+dist/ convention, manifest indirection, CI flows |
| **Index for AI agents** | [`llms.txt`](llms.txt) |

## Versioning

Semver via `package.json#version`. Two files move in lockstep (`package.json` + `paths-manifest.json#knowledge_version`) — enforced by `scripts/lib/bump-version.js` and CI gates.

- **Patch:** Figma sync data + CI-derived artifacts (registries, guidelines, media)
- **Minor:** additive contract change (new manifest entry, new sidecar, new sync phase)
- **Major:** breaking manifest contract (path renames, schema-shape changes)

Latest version lives in `package.json#version` and `paths-manifest.json#knowledge_version`. Downstream consumers pin a semver range in their `vendored.json` (e.g. `~0.17.0` for patch-auto-pull on a stable minor line); major/minor jumps require explicit consumer-side bumps.

## Consumers

- **Actian DS Claude plugin** — vendors a pinned snapshot nightly (`vendor-snapshot.yml`). Resolves tag via semver range. No runtime network dependency.
- **Docs site** (in development) — same manifest, separate build pipeline.
- **External / future AI agents** — `.md` URLs + `llms.txt` (next phase).

## License

See [`LICENSE.txt`](LICENSE.txt).
