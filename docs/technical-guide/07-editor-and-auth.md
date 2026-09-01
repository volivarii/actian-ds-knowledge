# Editor and auth

The Product Knowledge Editor is how someone who does not use git changes what the
design system says. It lives in this repository, it edits this repository, and it
is tooling rather than substrate: no consumer ever reads `editor/`.

*Counts read at knowledge v0.34.166 on 2026-09-01.*

The user-facing walkthrough is a separate document, published for authors. This
chapter is the build: what it is made of, how it deploys, and the two pieces of it
that currently depend on one person's accounts.

## What it is

A static single-page app, built with Vite, deployed from this repository's own
GitHub Pages at `volivarii.github.io/actian-ds-knowledge/editor/`. No server, no
third-party hosting, no recurring cost.

Authors sign in with GitHub, edit through forms and markdown (with an opt-in
rich-text mode), and every batch of edits becomes one pull request against `main`.
Submitting is not publishing: the change is live once a reviewer merges it and the
derive pipeline runs.

188 tracked source files across 14 units:

| Unit | Files | What it does |
| --- | --- | --- |
| `app/` | 45 | The shell, routing, panels, the coverage and relations views |
| `lib/` | 45 | Shared utilities |
| `markdown-engine/` | 20 | CodeMirror source mode and the Milkdown rich-text mode |
| `form-engine/` | 19 | RJSF plus uiSchemas plus the serializer round-trips |
| `substrate/` | 19 | Reading the repository's own dist and src as the Editor's data |
| `core/` | 8 | The commit and pull-request pipeline |
| `frontmatter-engine/` | 8 | The typed block at the top of every authored file |
| `uiSchemas/` | 8 | Presentation hints, deliberately not in `schemas/` |
| `drafts/` | 6 | Local pending changes before submission |
| `auth/` | 4 | The OAuth handshake |
| `styles/` | 3 | |
| `config/`, `generated/`, `settings/` | 1 each | Config, the generated safe-path set, the token vault |

## The four isolated units

The README states the architecture as four units, and the isolation is what makes
each one testable on its own:

- **Form engine.** RJSF plus uiSchemas plus serializer round-trips. A form edit has to serialize back to byte-identical source when nothing changed.
- **Commit and pull-request core.** Read-only path refusal, schema validation, then the GitHub branch, tree, commit and pull-request pipeline.
- **Draft inbox.** Pending changes held locally until the author submits.
- **Settings and token vault.** Token storage in `localStorage`.

**UI schemas live in `editor/src/uiSchemas/`, never in `schemas/`.** That is
principle P3 enforced at the directory level: `schemas/` is the published contract,
and labels, ordering and help text are one consumer's presentation. Putting a
label into a published schema would make the Editor's opinion part of everyone's
contract.

## The substrate boundary

The Editor edits this repository and never opens a pull request against a
consumer. This is doctrine rather than a limitation: an authoring tool that reaches
from the substrate into a consumer blurs exactly the line that keeps the substrate
agnostic. It overrode outside research that recommended reusing the in-house editor
across repositories for lower engineering cost. The ownership argument won.

Two things it deliberately cannot edit:

- **Token values.** They are decided in Figma and arrive through the sync.
- **A component's visual structure.** Same reason.

Letting either be edited in two places would produce two answers to one question,
which is the failure the whole system exists to prevent.

## The WYSIWYG safe set

The rich-text mode is opt-in and off by default, because a rich-text round-trip
through markdown is not lossless for every construct. `editor/src/generated/wysiwyg-safe-paths.json`
is the generated set of files that survive the round-trip byte-identically, and
`npm run gen:safe-paths` regenerates it.

The drift check for it is in `editor-ci.yml`, and its `paths:` filter is worth
studying as a pattern. The safe set is derived from the **content** of
`foundations/src/`, `accessibility/src/`, `content/src/`, `components/src/`, plus
`domains.json` and `scripts/lib/wysiwyg-registry.js`. A pull request that edits one
of those and breaks a file's round-trip safety changes the correct generated set
while touching no `editor/` file. So those trees are listed in the filter. Without
them the check would be vacuous: it would never fire on the pull requests that can
invalidate it.

This is the general shape of a correct trigger filter, and the general shape of the
mistake: **a check must trigger on everything that can change its answer, not on
the directory it lives in.**

Three authoring rules exist because of this round-trip, and they apply to every
domain's markdown:

- **No empty table cells.** An empty cell round-trips to `<br />`, which the fail-closed drift guard rejects.
- **No Jekyll or Kramdown attribute lists.** They are a docs-renderer concern (P1) and they corrupt the round-trip.
- **Wrap literal values in backticks.** Identifiers, filenames, URLs and placeholders left bare get escaped or autolinked, which renders identically but differs byte for byte, so the strict guard trips.

## CI and deployment

| Workflow | Trigger | Does |
| --- | --- | --- |
| `editor-ci.yml` | Pull request touching `editor/**` or a tree that feeds the safe set | Test suite, typecheck, production build, safe-set drift check |
| `editor-deploy.yml` | Push to `main` touching `editor/**`, or manual | Builds and publishes to GitHub Pages under `/editor/` |

`editor-ci.yml` is **not a required check**, so it does not block pull requests it
does not run on. The required substrate gates are untouched by it.

The deploy workflow splits build from deploy and denies `pages:write` and
`id-token:write` to the build job, because the build runs untrusted npm code. Only
the deploy job inherits those grants. Copy that split into any workflow that builds
third-party code and then publishes.

Local development:

```
cd editor
npm install
npm run dev      # Vite on http://localhost:5173/
npm test         # node --test under tsx
npm run build    # production build to dist/
```

## The auth worker

The Editor cannot complete a GitHub OAuth exchange on its own: GitHub's token
endpoint requires `client_secret` and has no CORS. So a small Cloudflare Worker
holds the secret server-side and brokers the exchange.

```
Editor SPA  ->  <worker>/auth?provider=github&site_id=<origin>
            ->  github.com/login/oauth/authorize   (302, CSRF cookie)
            ->  <worker>/callback?code&state
            ->  github.com/login/oauth/access_token   (with client_secret)
            ->  postMessage back to the SPA, origin-locked
```

It is vendored from `sveltia/sveltia-cms-auth` (MIT), with the pinned upstream SHA
and any local divergence recorded in the header comment of `auth-worker/src/index.js`.
`ALLOWED_DOMAINS` in `wrangler.toml` pins the origin it will post back to. The two
secrets, `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`, are set through
`wrangler secret put` and exist nowhere in the repository.

Re-pull upstream by diffing before applying:

```
curl -sL https://raw.githubusercontent.com/sveltia/sveltia-cms-auth/main/src/index.js > /tmp/upstream.js
diff /tmp/upstream.js auth-worker/src/index.js
```

## Succession risk, stated plainly

This is the part of the repository with a real single point of failure, and it is
the reason this chapter exists.

| Asset | Currently owned by | If that account goes away |
| --- | --- | --- |
| The GitHub OAuth App | A personal GitHub account | Nobody can sign in to the Editor |
| The Cloudflare Worker and its secrets | A personal Cloudflare account | Same |
| GitHub Pages hosting | The repository | Moves with the repository |

`auth-worker/README.md` carries the runbooks that fix this, and they are short:

- **Secret rotation**, five steps, to be done annually or on suspected compromise.
- **Ownership transfer to an Actian org**, five steps: recreate the OAuth App, deploy the Worker under the Actian Cloudflare account or transfer it, update `WORKER_ORIGIN` and `CLIENT_ID` in `editor/src/auth/oauth.ts`, update the callback URL, revoke the old app. Roughly 30 minutes plus one editor pull request.

Do the transfer as part of the move to Actian infrastructure, not after it. Until
it happens, the Editor's availability depends on one person's two personal
accounts.
