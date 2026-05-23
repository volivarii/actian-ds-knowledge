// Schema-driven editor for a component's _meta.yml file.
//
// Phase 1a shipped this as a self-contained screen with an internal
// component-list dropdown. PR 2a (Phase 1b) moves enumeration to the
// Sidebar; this component now accepts a `path` prop and renders the
// form for that single file.

import { useEffect, useMemo, useState } from "react";
import type { Octokit } from "@octokit/rest";
import type { RJSFSchema } from "@rjsf/utils";
import {
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Link,
  Spinner,
} from "@radix-ui/themes";
import { createOctokit, MissingPATError } from "../core/octokit";
import { submitDraft } from "../core/submitDraft";
import { getTextFile } from "./githubApi";
import { RJSFForm } from "../form-engine/RJSFForm";
import { guidelineMetaUiSchema } from "../uiSchemas/guidelineMeta";
import { parseYaml, stringifyYaml } from "../form-engine/yamlSerializer";

interface MetaEditScreenProps {
  path: string | null;
  octokit?: Octokit;
  onOpenSettings?: () => void;
}

type LoadState<T> =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; value: T }
  | { kind: "error"; message: string };

function slugFromPath(path: string): string | null {
  const m = path.match(/^components\/src\/([^/]+)\/_meta\.yml$/);
  return m && m[1] ? m[1] : null;
}

export function MetaEditScreen({
  path,
  octokit,
  onOpenSettings,
}: MetaEditScreenProps) {
  const [ghError, setGhError] = useState<string | null>(null);
  const gh = useMemo<Octokit | null>(() => {
    if (octokit) return octokit;
    try {
      return createOctokit();
    } catch (err) {
      setGhError(
        err instanceof MissingPATError
          ? err.message
          : `Failed to initialise GitHub client: ${(err as Error).message}`,
      );
      return null;
    }
  }, [octokit]);

  const slug = path ? slugFromPath(path) : null;
  const [schema, setSchema] = useState<LoadState<RJSFSchema>>({ kind: "idle" });
  const [meta, setMeta] = useState<
    LoadState<{ value: unknown; originalText: string }>
  >({ kind: "idle" });
  // Tracks in-progress edits; kept in sync with meta on load and reset
  // whenever the path changes.
  const [formData, setFormData] = useState<unknown>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!gh || !slug) return;
    setSchema({ kind: "loading" });
    setMeta({ kind: "loading" });
    setFormData(undefined);
    setPrUrl(null);
    setSubmitError(null);
    (async () => {
      try {
        const [schemaText, metaText] = await Promise.all([
          getTextFile(gh, "schemas/guideline-meta.json"),
          getTextFile(gh, `components/src/${slug}/_meta.yml`),
        ]);
        const parsed = parseYaml(metaText);
        setSchema({
          kind: "ready",
          value: JSON.parse(schemaText) as RJSFSchema,
        });
        setMeta({
          kind: "ready",
          value: { value: parsed, originalText: metaText },
        });
        setFormData(parsed);
      } catch (err) {
        const msg = (err as Error).message;
        setSchema({ kind: "error", message: msg });
        setMeta({ kind: "error", message: msg });
      }
    })();
  }, [gh, slug]);

  const handleSubmit = async (submitted: unknown) => {
    if (!gh || meta.kind !== "ready" || schema.kind !== "ready") return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // _meta.yml's `domains.<name>` maps must be flow-style — the
      // knowledge repo's restricted YAML parser rejects block-nested
      // values under domains. flowAtDepth: 2 means: every YAMLMap at
      // depth 2 (i.e. each domain) becomes `{ status: …, owner: … }`.
      const yaml = stringifyYaml(submitted, {
        originalText: meta.value.originalText,
        flowAtDepth: 2,
      });
      const result = await submitDraft(
        {
          id: `meta-${slug}-${Date.now()}`,
          message: `chore(${slug}): update _meta.yml via editor\n\nEdited through the Knowledge Editor (Phase 1b).`,
          files: [
            {
              path: `components/src/${slug}/_meta.yml`,
              content: yaml,
            },
          ],
          sourceMetadata: { kind: "human", via: "MetaEditScreen" },
        },
        {
          owner: "volivarii",
          repo: "actian-ds-knowledge",
          base: "main",
          schemas: {
            "guideline-meta": schema.value as Record<string, unknown>,
          },
          octokit: gh,
        },
      );
      setPrUrl(result.prUrl);
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (ghError) {
    return (
      <Callout.Root color="amber" role="alert">
        <Callout.Text>
          {ghError}{" "}
          {onOpenSettings && (
            <Link
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onOpenSettings();
              }}
            >
              Open Settings →
            </Link>
          )}
        </Callout.Text>
      </Callout.Root>
    );
  }

  if (!path) {
    return (
      <Callout.Root>
        <Callout.Text>Choose a component in the sidebar to begin.</Callout.Text>
      </Callout.Root>
    );
  }

  if (!slug) {
    return (
      <Callout.Root color="red" role="alert">
        <Callout.Text>Path {path} is not a component _meta.yml.</Callout.Text>
      </Callout.Root>
    );
  }

  if (schema.kind === "error") {
    return (
      <Callout.Root color="ruby" role="alert">
        <Callout.Text>{schema.message}</Callout.Text>
      </Callout.Root>
    );
  }

  if (meta.kind === "error") {
    return (
      <Callout.Root color="ruby" role="alert">
        <Callout.Text>{meta.message}</Callout.Text>
      </Callout.Root>
    );
  }

  if (schema.kind !== "ready" || meta.kind !== "ready") {
    return <Spinner />;
  }

  const schemaValue = schema.value;

  return (
    <Card>
      <Flex direction="column" gap="3" p="3">
        <Heading size="3">{path}</Heading>
        <RJSFForm
          schema={schemaValue}
          uiSchema={guidelineMetaUiSchema}
          formData={formData}
          onChange={(next) => setFormData(next)}
          onSubmit={(v) => handleSubmit(v)}
        >
          <Flex gap="2" mt="3">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Opening PR…" : "Submit as PR"}
            </Button>
          </Flex>
        </RJSFForm>
        {prUrl && (
          <Callout.Root color="grass" role="status">
            <Callout.Text>
              PR opened —{" "}
              <Link href={prUrl} target="_blank" rel="noreferrer">
                {prUrl}
              </Link>
            </Callout.Text>
          </Callout.Root>
        )}
        {submitError && (
          <Callout.Root color="ruby" role="alert">
            <Callout.Text>Submit failed: {submitError}</Callout.Text>
          </Callout.Root>
        )}
      </Flex>
    </Card>
  );
}
