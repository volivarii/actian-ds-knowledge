import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { UiSchema } from "@rjsf/utils";
import type { Octokit } from "@octokit/rest";
import type { RJSFSchema } from "@rjsf/utils";
import { Box, Flex, Button, Text, Callout } from "@radix-ui/themes";
import { RJSFForm } from "../form-engine/RJSFForm";
import { frontmatterTemplates } from "../form-engine/templates";
import {
  stringifyYaml,
  assembleFrontmatterFilePreservingComments,
} from "../form-engine/yamlSerializer";
import {
  splitFrontmatter,
  classifyFrontmatter,
} from "../substrate/splitFrontmatter";
import { CodeMirrorEditor } from "../markdown-engine/CodeMirrorEditor";
import { shouldUseWysiwyg } from "../lib/wysiwygPaths";
import { submissionCartSingleton } from "../drafts/store-instance";
import { getTextFile, getTextFileWithSha } from "./githubApi";
import { TierBanner } from "./TierBanner";
import { MarkdownEditScreen } from "./MarkdownEditScreen";
import { RefArrayWidget } from "../form-engine/widgets/RefArrayWidget";
import { TagInputWidget } from "../form-engine/widgets/TagInputWidget";

// Lazy-loaded so the Milkdown/ProseMirror bundle (the largest editor dep) splits
// into an async chunk fetched only when the WYSIWYG flag is on — it stays out of
// the initial load for the default (flag-off) CodeMirror path.
const RichBodyEditor = lazy(() =>
  import("../markdown-engine/RichBodyEditor").then((m) => ({
    default: m.RichBodyEditor,
  })),
);

const WIDGETS = { RefArray: RefArrayWidget, TagInput: TagInputWidget };

/** Pure: serialize form frontmatter + re-join the prose body into a file.
 *  Pass `flowAtDepth` to control inline-object depth (default 2 = flow at
 *  depth ≥ 2). Pass `null` for fully block-style output (no inline objects at
 *  any depth — use for records whose YAML must stay fully expanded). */
export function assembleFrontmatterFile(
  formData: unknown,
  frontmatterText: string | null,
  body: string,
  flowAtDepth: number | null = 2,
): string {
  const yaml = stringifyYaml(formData, {
    originalText: frontmatterText ?? undefined,
    flowAtDepth: flowAtDepth === null ? undefined : flowAtDepth,
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
  /** When true, hide the prose-body editor — used for records with no prose
   *  body. The loaded body round-trips unchanged. */
  bodyless?: boolean;
  /** Controls the YAML flow depth passed to `assembleFrontmatterFile`.
   *  - `undefined` / omitted → defaults to 2 (flow-style at depth ≥ 2).
   *  - `null` → block-style only (no inline objects at any depth). */
  yamlFlowAtDepth?: number | null;
  /** When true, serialize via the comment-preserving Document path so `#`
   *  comments interleaved between data lines survive a form save. */
  preserveComments?: boolean;
}

type Loaded =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "raw" } // frontmatter present but unparseable → raw editor + banner
  | { kind: "no-frontmatter" } // no `---` fence at all → raw editor, NO banner
  | { kind: "schema-error" } // frontmatter OK, schema fetch failed → raw editor + soft notice
  | {
      kind: "ready";
      schema: RJSFSchema;
      formData: unknown;
      frontmatterText: string | null;
      body: string;
      basedOnSha: string;
    };

export function FrontmatterBodyEditScreen(props: Props) {
  const {
    path,
    schemaKey,
    uiSchema,
    octokit,
    bodyless,
    yamlFlowAtDepth,
    preserveComments,
  } = props;
  const [state, setState] = useState<Loaded>({ kind: "loading" });
  const [formData, setFormData] = useState<unknown>(undefined);
  const [body, setBody] = useState<string>("");
  // Latest-value mirrors. The body editors (Milkdown's useEditor([]) and
  // CodeMirror's useEffect([])) FREEZE their onChange at mount, capturing the
  // formData/body of that render. Reading these refs in the flush handlers keeps
  // a body edit from flushing the cart with stale frontmatter (and vice-versa),
  // which would silently revert an interleaved field edit.
  const formDataRef = useRef(formData);
  formDataRef.current = formData;
  const bodyRef = useRef(body);
  bodyRef.current = body;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });
      try {
        // 1. Load the file FIRST. Cart wins, then remote main, then a 404 → stub
        //    ("" → raw fallback). The schema is not fetched yet: a file with no
        //    parseable frontmatter never needs it, and a transient schema-fetch
        //    failure must not make a previously-openable file uneditable.
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
            // Capture the blob sha alongside content so staged edits carry a
            // real base. Without it, basedOnSha stays "" and detectStaleBase
            // skips this file (core/staleBase.ts) — the no-silent-overwrite
            // guarantee (#280) would be a no-op for app-context records, which
            // MarkdownEditScreen already avoids by threading res.data.sha.
            const loaded = await getTextFileWithSha(octokit, path);
            text = loaded.text;
            basedOnSha = loaded.sha;
          } catch (err) {
            if ((err as { status?: number }).status !== 404) throw err;
            text = ""; // new file — no frontmatter yet → raw fallback to start it
            // basedOnSha stays "" — a 404 means there's no remote base yet, so
            // there is nothing to be stale against.
          }
        }
        if (cancelled) return;

        // 2. Classify BEFORE touching the schema. No parseable frontmatter →
        //    raw editing without fetching the schema at all.
        const split = splitFrontmatter(text);
        if (split.data === null) {
          // A file with NO fence is not malformed — edit it as plain markdown
          // (no scary banner). Keep the banner only for a broken fence.
          setState(
            classifyFrontmatter(text) === "malformed"
              ? { kind: "raw" }
              : { kind: "no-frontmatter" },
          );
          return;
        }

        // 3. Frontmatter present → fetch the form schema. If that fails,
        //    degrade to raw editing (the file is still editable) rather than
        //    the hard red error that would strand it.
        let schema: RJSFSchema;
        try {
          const schemaText = await getTextFile(
            octokit,
            `schemas/${schemaKey}.json`,
          );
          schema = JSON.parse(schemaText) as RJSFSchema;
        } catch {
          if (!cancelled) setState({ kind: "schema-error" });
          return;
        }
        if (cancelled) return;

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
      // preserveComments (content/foundations): use the Document-merge path so
      // `#` comments interleaved between data lines survive the save.
      // Otherwise the flow-depth path: yamlFlowAtDepth undefined → default (2);
      // null → block-style. assembleFrontmatterFile accepts null; default is 2.
      const content = preserveComments
        ? assembleFrontmatterFilePreservingComments(
            fd,
            state.frontmatterText,
            b,
          )
        : assembleFrontmatterFile(
            fd,
            state.frontmatterText,
            b,
            yamlFlowAtDepth !== undefined ? yamlFlowAtDepth : 2,
          );
      submissionCartSingleton.add({
        path,
        content,
        basedOnSha: state.basedOnSha,
        addedAt: Date.now(),
      });
    },
    [state, path, yamlFlowAtDepth, preserveComments],
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
  if (state.kind === "no-frontmatter")
    return (
      <MarkdownEditScreen
        path={path}
        octokit={octokit}
        onOpenSettings={props.onOpenSettings}
        onNavigate={props.onNavigate}
      />
    );
  if (state.kind === "schema-error")
    return (
      <Box>
        <Callout.Root color="gray" mb="2">
          <Callout.Text>
            Couldn't load this file's form schema — editing as raw text. Your
            edits are still saved.
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
          scheduleFlush(next, bodyRef.current);
        }}
        onSubmit={(next) => flushToCart(next, bodyRef.current)}
        submitLabel="Add to batch"
      >
        {!bodyless && (
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
              {shouldUseWysiwyg(path) ? (
                <Suspense
                  fallback={
                    <Box p="3" role="status">
                      <Text size="1" color="gray">
                        Loading rich editor…
                      </Text>
                    </Box>
                  }
                >
                  <RichBodyEditor
                    key={path}
                    initialText={body}
                    onChange={(t) => {
                      setBody(t);
                      scheduleFlush(formData, t);
                    }}
                    filename={path.split("/").pop()}
                  />
                </Suspense>
              ) : (
                <CodeMirrorEditor
                  key={path}
                  initialText={body}
                  onChange={(t) => {
                    setBody(t);
                    scheduleFlush(formDataRef.current, t);
                  }}
                />
              )}
            </Box>
          </Box>
        )}
        <Flex gap="2" mt="3">
          <Button type="submit">Add to batch</Button>
        </Flex>
      </RJSFForm>
    </Box>
  );
}
