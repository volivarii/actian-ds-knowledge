# actian-ds-knowledge

The federated **knowledge substrate** (source of truth) for the Actian Design
System — foundations, components, content, accessibility, tokens — consumed by
the [Actian DS Claude plugin](https://github.com/volivarii/Actian-DS-Claude-plugin)
and the docs site, and built to serve future consumers (Storybook, AI surfaces)
without bending to any one of them.

> **New here? Read [`ARCHITECTURE.md`](ARCHITECTURE.md)** — it maps the top level
> into layers (knowledge · contract · metadata · tooling) so you can tell the
> design-system content from the build machinery at a glance.

## Quick routes

| I want to… | Go to |
|---|---|
| **Consume this** (build a reader, Storybook, AI surface) | [`CONSUMING.md`](CONSUMING.md) |
| **Understand the layout** | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| **Author content** | the `src/AUTHORING.md` in `foundations/`, `components/`, `content/`, `accessibility/` |
| **See every artifact** | [`paths-manifest.json`](paths-manifest.json) — the contract, keyed + zoned |
| **Check coverage / debt** | [`components/dist/guidelines/coverage.md`](components/dist/guidelines/coverage.md) |
| **Contribute / CI** | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| **AI-agent guide** | [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) |
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
