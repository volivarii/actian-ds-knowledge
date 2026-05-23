// The end-to-end pipeline: validate paths → validate schemas → create branch
// off main → build tree blobs → commit → open PR. Both the human form and any
// future AI producer (claude-skill, MCP server, automation bot) call this
// single entry point with a `Draft`. The shared API is the AI seam — see
// spec §4.2.

import type { Octokit } from "@octokit/rest";
import {
  type CommitResult,
  type Draft,
  ReadonlyPathError,
} from "./types";
import { isReadOnlyPath } from "./validatePaths";
import {
  type SchemaMap,
  validateAgainstSchema,
} from "./validateAgainstSchema";
import { createOctokit } from "./octokit";

export interface SubmitDraftConfig {
  owner: string;
  repo: string;
  base: string;
  schemas: SchemaMap;
  octokit?: Octokit;
}

const DEFAULT_CONFIG: Omit<SubmitDraftConfig, "schemas" | "octokit"> = {
  owner: "volivarii",
  repo: "actian-ds-knowledge",
  base: "main",
};

function buildBranchName(draft: Draft): string {
  if (draft.branch) return draft.branch;
  const stamp = Date.now().toString(36);
  const shortId = draft.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "draft";
  return `editor/${stamp}-${shortId}`;
}

function buildPrBody(draft: Draft): string {
  if (!draft.sourceMetadata) return draft.message;
  const { kind, via, model, prompt } = draft.sourceMetadata;
  const lines = [draft.message, "", "---", `_source: **${kind}**`];
  if (via) lines.push(`via: \`${via}\``);
  if (model) lines.push(`model: \`${model}\``);
  if (prompt) lines.push(`prompt: ${JSON.stringify(prompt)}`);
  return lines.join("\n");
}

export async function submitDraft(
  draft: Draft,
  config: SubmitDraftConfig,
): Promise<CommitResult> {
  for (const file of draft.files) {
    if (isReadOnlyPath(file.path)) throw new ReadonlyPathError(file.path);
  }

  for (const file of draft.files) {
    validateAgainstSchema({
      path: file.path,
      content: file.content,
      schemas: config.schemas,
    });
  }

  const owner = config.owner ?? DEFAULT_CONFIG.owner;
  const repo = config.repo ?? DEFAULT_CONFIG.repo;
  const base = config.base ?? DEFAULT_CONFIG.base;
  const gh = config.octokit ?? createOctokit();

  const baseRef = await gh.git.getRef({
    owner,
    repo,
    ref: `heads/${base}`,
  });
  const baseSha = baseRef.data.object.sha;

  const branch = buildBranchName(draft);
  await gh.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branch}`,
    sha: baseSha,
  });

  const tree = await Promise.all(
    draft.files.map(async (file) => {
      const blob = await gh.git.createBlob({
        owner,
        repo,
        content: file.content,
        encoding: "utf-8",
      });
      return {
        path: file.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.data.sha,
      };
    }),
  );

  const newTree = await gh.git.createTree({
    owner,
    repo,
    base_tree: baseSha,
    tree,
  });

  const commit = await gh.git.createCommit({
    owner,
    repo,
    message: draft.message,
    tree: newTree.data.sha,
    parents: [baseSha],
  });

  await gh.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: commit.data.sha,
  });

  const title = draft.message.split("\n")[0] ?? draft.message;
  const pr = await gh.pulls.create({
    owner,
    repo,
    head: branch,
    base,
    title,
    body: buildPrBody(draft),
  });

  return {
    prUrl: pr.data.html_url,
    branch,
    sha: commit.data.sha,
  };
}
