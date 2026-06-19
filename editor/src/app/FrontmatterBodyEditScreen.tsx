import { useCallback, useEffect, useRef, useState } from "react";
import type { UiSchema } from "@rjsf/utils";
import type { Octokit } from "@octokit/rest";
import type { RJSFSchema } from "@rjsf/utils";
import { Box, Flex, Button, Text, Callout } from "@radix-ui/themes";
import { RJSFForm } from "../form-engine/RJSFForm";
import { frontmatterTemplates } from "../form-engine/templates";
import { stringifyYaml } from "../form-engine/yamlSerializer";
import { splitFrontmatter } from "../substrate/splitFrontmatter";
import { CodeMirrorEditor } from "../markdown-engine/CodeMirrorEditor";
import { submissionCartSingleton } from "../drafts/store-instance";
import { getTextFile } from "./githubApi";
import { TierBanner } from "./TierBanner";
import { MarkdownEditScreen } from "./MarkdownEditScreen";
import { RefArrayWidget } from "../form-engine/widgets/RefArrayWidget";

const WIDGETS = { RefArray: RefArrayWidget };

/** Pure: serialize form frontmatter + re-join the prose body into a file. */
export function assembleFrontmatterFile(
  formData: unknown,
  frontmatterText: string | null,
  body: string,
): string {
  const yaml = stringifyYaml(formData, {
    originalText: frontmatterText ?? undefined,
    flowAtDepth: 2,
  });
  const fm = yaml.endsWith("\n") ? yaml : yaml + "\n";
  return `---\n${fm}---\n${body.startsWith("\n") ? body : "\n" + body}`;
}

interface Props {
  path: string;
  schemaKey: string;
  uiSchema: UiSchema;
  octokit: Octokit;
  onOpenSettings?: () => void;
  onNavigate?: (p: string | null) => void;
}

type Loaded =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "raw" } // frontmatter unparseable → fall back to raw editor
  | {
      kind: "ready";
      schema: RJSFSchema;
      formData: unknown;
      frontmatterText: string | null;
      body: string;
      basedOnSha: string;
    };

export function FrontmatterBodyEditScreen(props: Props) {
  const { path, schemaKey, uiSchema, octokit } = props;
  const [state, setState] = useState<Loaded>({ kind: "loading" });
  const [formData, setFormData] = useState<unknown>(undefined);
  const [body, setBody] = useState<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });
      try {
        const schemaText = await getTextFile(
          octokit,
          `schemas/${schemaKey}.json`,
        );
        const schema = JSON.parse(schemaText) as RJSFSchema;

        // Cart wins, then remote main, then a 404 → stub ("" → raw fallback).
        const cartHit = submissionCartSingleton
          .list()
          .find((e) => e.path === path);
        let text: string;
        let basedOnSha = "";
        if (cartHit) {
          text = cartHit.content;
          basedOnSha = cartHit.basedOnSha;
        } else {
          try {
            text = await getTextFile(octokit, path);
          } catch (err) {
            if ((err as { status?: number }).status !== 404) throw err;
            text = ""; // new file — no frontmatter yet → raw fallback to start it
          }
        }
        if (cancelled) return;

        const split = splitFrontmatter(text);
        if (split.data === null) {
          setState({ kind: "raw" }); // missing/malformed frontmatter
          return;
        }
        setFormData(split.data);
        setBody(split.body);
        setState({
          kind: "ready",
          schema,
          formData: split.data,
          frontmatterText: split.frontmatterText,
          body: split.body,
          basedOnSha,
        });
      } catch (err) {
        if (!cancelled)
          setState({ kind: "error", message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, schemaKey, octokit]);

  const flushToCart = useCallback(
    (fd: unknown, b: string) => {
      if (state.kind !== "ready") return;
      const content = assembleFrontmatterFile(fd, state.frontmatterText, b);
      submissionCartSingleton.add({
        path,
        content,
        basedOnSha: state.basedOnSha,
        addedAt: Date.now(),
      });
    },
    [state, path],
  );

  const scheduleFlush = useCallback(
    (fd: unknown, b: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => flushToCart(fd, b), 1000);
    },
    [flushToCart],
  );

  if (state.kind === "loading") return <Text>Loading…</Text>;
  if (state.kind === "error")
    return (
      <Callout.Root color="red">
        <Callout.Text>{state.message}</Callout.Text>
      </Callout.Root>
    );
  if (state.kind === "raw")
    return (
      <Box>
        <Callout.Root color="amber" mb="2">
          <Callout.Text>
            Couldn't parse this file's frontmatter — editing as raw text.
          </Callout.Text>
        </Callout.Root>
        <MarkdownEditScreen
          path={path}
          octokit={octokit}
          onOpenSettings={props.onOpenSettings}
          onNavigate={props.onNavigate}
        />
      </Box>
    );

  return (
    <Box>
      <TierBanner path={path} />
      <RJSFForm
        schema={state.schema}
        uiSchema={uiSchema}
        formData={formData}
        widgets={WIDGETS}
        templates={frontmatterTemplates}
        onChange={(next) => {
          setFormData(next);
          scheduleFlush(next, body);
        }}
        onSubmit={(next) => flushToCart(next, body)}
        submitLabel="Add to batch"
      >
        <Box mt="4">
          <Text size="2" weight="bold" as="div" mb="1">
            Prose body
          </Text>
          <Box
            style={{
              height: 320,
              border: "1px solid var(--gray-5)",
              borderRadius: 6,
            }}
          >
            <CodeMirrorEditor
              key={path}
              initialText={body}
              onChange={(t) => {
                setBody(t);
                scheduleFlush(formData, t);
              }}
            />
          </Box>
        </Box>
        <Flex gap="2" mt="3">
          <Button type="submit">Add to batch</Button>
        </Flex>
      </RJSFForm>
    </Box>
  );
}
