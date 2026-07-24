import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
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
  routeNoFrontmatter,
} from "../substrate/splitFrontmatter";
import { assembleYamlFrontmatterFile } from "../frontmatter-engine/assembleYaml";
import { YamlFrontmatterEditor } from "../frontmatter-engine/YamlFrontmatterEditor";
import { EditorView } from "@codemirror/view";
import { CodeMirrorEditor } from "../markdown-engine/CodeMirrorEditor";
import { shouldUseWysiwyg } from "../lib/wysiwygPaths";
import { submissionCartSingleton } from "../drafts/store-instance";
import { getTextFile, getTextFileWithSha } from "./githubApi";
import { TierBanner } from "./TierBanner";
import { MarkdownEditScreen } from "./MarkdownEditScreen";
import { RefArrayWidget } from "../form-engine/widgets/RefArrayWidget";
import { TagInputWidget } from "../form-engine/widgets/TagInputWidget";
import {
  RelationsPanel,
  readRelationsPanelCollapsed,
  writeRelationsPanelCollapsed,
} from "./RelationsPanel";
import { scrollRichHeading } from "./richScroll";
import { computeFocusedSection } from "./SectionFocusTracker";
import type { Heading } from "../lib/headingScan";
import {
  countsBySection,
  incomingForFile,
  graphNeighborsForFile,
} from "../lib/referenceIndex";
import { loadAnchorIndex } from "../lib/anchorIndex";

// Lazy-loaded so the Milkdown/ProseMirror bundle (the largest editor dep) splits
// into an async chunk fetched only when the WYSIWYG flag is on — it stays out of
// the initial load for the default (flag-off) CodeMirror path.
const RichBodyEditor = lazy(() =>
  import("../markdown-engine/RichBodyEditor").then((m) => ({
    default: m.RichBodyEditor,
  })),
);

const WIDGETS = { RefArray: RefArrayWidget, TagInput: TagInputWidget };

/** Derive the component slug from a path under `components/src/<slug>/…`
 *  (excluding the `categories` pseudo-slug), else null. Mirrors the derivation
 *  in MarkdownEditScreen; drives <Media> preview + insertion in the rich editor. */
function componentSlugFromPath(path: string): string | null {
  const m = path.match(/^components\/src\/([^/]+)\//);
  return m && m[1] && m[1] !== "categories" ? m[1] : null;
}

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
  /** When true, frontmatter is OPTIONAL for this domain (prose: content +
   *  foundations): a file with no `---` fence opens silently in the markdown
   *  editor. When false/omitted (record domains), a missing fence keeps the
   *  amber missing-frontmatter warning + raw fallback. */
  frontmatterOptional?: boolean;
  /** `"yaml"` edits the frontmatter text directly; omitted keeps the RJSF
   *  form. Slice 1 sets this on app-context records only. */
  surface?: "yaml";
}

type Loaded =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "raw" } // frontmatter present but unparseable → raw editor + banner
  // no `---` fence in an optional-frontmatter (prose) domain → markdown editor,
  // NO banner. Carries the already-fetched blob so MarkdownEditScreen reuses it
  // instead of a second network fetch.
  | { kind: "no-frontmatter"; text: string; basedOnSha: string }
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
    frontmatterOptional,
    surface,
  } = props;
  const [state, setState] = useState<Loaded>({ kind: "loading" });
  const [formData, setFormData] = useState<unknown>(undefined);
  const [body, setBody] = useState<string>("");
  const [fmText, setFmText] = useState<string>("");
  const fmTextRef = useRef(fmText);
  fmTextRef.current = fmText;
  // Latest-value mirrors. The body editors (Milkdown's useEditor([]) and
  // CodeMirror's useEffect([])) FREEZE their onChange at mount, capturing the
  // formData/body of that render. Reading these refs at the CALL SITE (the
  // moment a body edit or the "Add to batch" click passes a snapshot into
  // scheduleFlush/flushToCart) keeps a body edit from staging stale
  // frontmatter (and vice-versa), which would silently revert an interleaved
  // field edit. None of these refs is ever read inside flushToCart itself —
  // only the fd/b/fm arguments it was called with — so a flush that fires
  // after the screen has moved on to a different file still stages the
  // snapshot taken when it was scheduled, not whatever the refs hold by then.
  const formDataRef = useRef(formData);
  formDataRef.current = formData;
  const bodyRef = useRef(body);
  bodyRef.current = body;
  // Keyed by path, not a single slot: scheduling a flush for one file must
  // cancel only THAT file's own pending timer, never another file's. See
  // scheduleFlush below for why a shared single slot silently dropped a
  // foreign file's armed edit the moment the user typed anywhere else.
  const debounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  // A debounced flush firing after this screen has been torn down entirely
  // (not just navigated to another file — the same instance survives that,
  // see scheduleFlush) would write to a cart nothing is left to read from.
  useEffect(() => {
    return () => {
      for (const timer of debounceRef.current.values()) clearTimeout(timer);
      debounceRef.current.clear();
    };
  }, []);

  // Tick whenever anchorIndex finishes loading; drives recomputation of the
  // incoming-refs counts + snippets that feed the RelationsPanel. Mirrors
  // MarkdownEditScreen's anchorIndexTick pattern.
  const [anchorIndexTick, setAnchorIndexTick] = useState(0);
  useEffect(() => {
    void loadAnchorIndex(octokit)
      .then(() => setAnchorIndexTick((t) => t + 1))
      .catch(() => {
        /* swallow (incoming counts just won't fire) */
      });
  }, [octokit, path]);

  // Frontmatter form visibility: collapsed by default on body-carrying files
  // (the prose editor is the main surface); expanded on bodyless record files
  // whose form is the whole content.
  const [fmCollapsed, setFmCollapsed] = useState<boolean>(!bodyless);

  // RelationsPanel's collapsed state is owned here (not by the panel
  // itself) so the expensive incoming/counts memos below can be gated to a
  // no-op instead of recomputing on every keystroke while their DOM stays
  // hidden. Seeded from the same localStorage key the toggle writes to.
  const [relationsCollapsed, setRelationsCollapsed] = useState<boolean>(() =>
    readRelationsPanelCollapsed(),
  );
  const toggleRelationsCollapsed = useCallback(() => {
    setRelationsCollapsed((c) => {
      const next = !c;
      writeRelationsPanelCollapsed(next);
      return next;
    });
  }, []);

  // RelationsPanel data for the prose body this screen edits. This screen's
  // outgoing refs live in the FORM (a11y_refs/motion_refs fields), not the
  // body, so outgoing stays empty and Manage is a no-op here (PR A).
  // Incoming/counts are skipped while collapsed; graphNeighbors is a baked
  // path-keyed lookup and stays cheap enough to leave unconditional.
  const incoming = useMemo(
    () => (relationsCollapsed ? [] : incomingForFile(path, body)),
    // anchorIndexTick refreshes when the index finishes loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, body, anchorIndexTick, relationsCollapsed],
  );
  const graphNeighbors = useMemo(() => graphNeighborsForFile(path), [path]);
  const counts = useMemo(
    () =>
      relationsCollapsed
        ? new Map<string, number>()
        : countsBySection(path, body, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, body, anchorIndexTick, relationsCollapsed],
  );

  // Open another file in the editor: reuses this screen's existing
  // navigation prop, the same way MarkdownEditScreen's handleOpenFile does.
  const handleOpenFile = useCallback(
    (p: string) => {
      props.onNavigate?.(p);
    },
    [props.onNavigate],
  );

  // The CodeMirror body view (non-WYSIWYG branch), captured so the relations
  // outline can scroll it and so cursor moves can drive the active-section
  // marker. The rich (Milkdown) branch has no CM view: it navigates the DOM
  // via scrollRichHeading and emits no cursor line, so its active marker stays
  // null until a rich-mode cursor observer lands (follow-up).
  const [cmView, setCmView] = useState<EditorView | null>(null);
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);
  const handleCursorLineChange = useCallback((line: number) => {
    const section = computeFocusedSection(bodyRef.current, line);
    setActiveAnchor(section ? section.anchor : null);
  }, []);
  // Reset the active marker when the file changes; the previous body's
  // cursor-derived section no longer applies.
  useEffect(() => {
    setActiveAnchor(null);
  }, [path]);
  const cmNavigate = useCallback(
    (heading: Heading) => {
      if (!cmView) return;
      const pos = cmView.state.doc.line(heading.line + 1).from;
      cmView.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: "start" }),
      });
      cmView.focus();
    },
    [cmView],
  );

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
          // Route the no-parse case. A broken fence always warns ("raw"). A
          // MISSING fence is silent ("no-frontmatter") only for prose domains
          // where frontmatter is optional (content/foundations); record domains
          // (app-context/categories/words-to-avoid) REQUIRE it, so a missing
          // fence keeps the warning + raw fallback.
          setState(
            routeNoFrontmatter(text, frontmatterOptional === true) ===
              "no-frontmatter"
              ? { kind: "no-frontmatter", text, basedOnSha }
              : { kind: "raw" },
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
        setFmText(split.frontmatterText ?? "");
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
  }, [path, schemaKey, octokit, frontmatterOptional]);

  const flushToCart = useCallback(
    (fd: unknown, b: string, fm: string) => {
      if (state.kind !== "ready") return;
      // surface === "yaml": the pane edits the frontmatter TEXT directly, so
      // assembly is plain concatenation of that text (never a re-serialized
      // `fd`) — see assembleYaml.ts. `fm` is a SNAPSHOT taken at the moment
      // this flush was scheduled (or at click time for the button), never a
      // live ref read here: a debounced flush can fire after the screen has
      // navigated to a different file. The `state.kind !== "ready"` guard
      // above does NOT perform any staleness check of its own — it only
      // rejects non-ready states. What actually makes a late flush stage
      // under the RIGHT path with the RIGHT sha is that this function is a
      // useCallback with `[state, path, ...]` in its deps: a pending timer
      // was scheduled with a `flushToCart` closure created for file A, so it
      // still closes over A's own `state`/`path` no matter what the screen
      // has moved on to since. A ref read at flush time, by contrast, would
      // silently pull in whatever file is CURRENTLY on screen's live
      // frontmatter text instead of the text that was on screen when this
      // flush was armed — which is exactly why `fm` is an argument, not a
      // ref read. Otherwise, preserveComments (content/foundations):
      // use the Document-merge path so `#` comments interleaved between data
      // lines survive the save. Otherwise the flow-depth path: yamlFlowAtDepth
      // undefined → default (2); null → block-style. assembleFrontmatterFile
      // accepts null; default is 2.
      const content =
        surface === "yaml"
          ? assembleYamlFrontmatterFile(fm, b)
          : preserveComments
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
    [state, path, yamlFlowAtDepth, preserveComments, surface],
  );

  const scheduleFlush = useCallback(
    (fd: unknown, b: string, fm: string) => {
      // fd/b/fm are all snapshotted HERE, at schedule time — not re-read from
      // any ref when the timer fires. debounceRef is a Map keyed by path, so
      // clearing "the" pending timer below only ever clears THIS path's own
      // prior timer, never another file's: a user who edits file A and
      // navigates to file B within the debounce window still gets A's edit
      // staged under A even if they then edit B too — B's own scheduleFlush
      // call only touches key B, leaving A's timer to fire on its own
      // schedule with the snapshot it captured when it was armed. (A single
      // shared slot could not make this distinction: any call anywhere would
      // clear whatever timer happened to occupy the one slot, silently
      // dropping a foreign file's armed edit.)
      const key = path;
      const pending = debounceRef.current.get(key);
      if (pending) clearTimeout(pending);
      const timer = setTimeout(() => {
        debounceRef.current.delete(key);
        flushToCart(fd, b, fm);
      }, 1000);
      debounceRef.current.set(key, timer);
    },
    [path, flushToCart],
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
        // Hand off the blob we already fetched so MarkdownEditScreen skips its
        // own getContent. Only when we have a real base (empty sha ⇒ 404 stub /
        // cart entry — let MarkdownEditScreen build its own stub / cart-win).
        preloaded={
          state.basedOnSha
            ? { text: state.text, sha: state.basedOnSha }
            : undefined
        }
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

  // Mode-specific navigation: the rich branch scrolls the Milkdown DOM by
  // heading index; the CodeMirror branch dispatches a CM scroll effect. Both
  // reuse the same panel, so it takes the navigate handler and (cursor-derived)
  // active anchor per mode.
  const renderRelationsPanel = (
    onNavigate: (heading: Heading, index: number) => void,
    active: string | null,
  ) => (
    <Box
      className="editor-outline-pane"
      style={{
        width: 260,
        minWidth: 260,
        flexShrink: 0,
        border: "1px solid var(--gray-5)",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      <RelationsPanel
        text={body}
        file={path}
        counts={counts}
        incoming={incoming}
        outgoing={[]}
        graphNeighbors={graphNeighbors}
        onNavigate={onNavigate}
        onOpenFile={handleOpenFile}
        // onManageConnections omitted: this screen's refs are edited in the
        // form, not the body; the manage flow arrives with a later slice.
        collapsed={relationsCollapsed}
        onToggleCollapsed={toggleRelationsCollapsed}
        activeAnchor={active}
      />
    </Box>
  );

  // Shared between both branches: the prose body section (when the record
  // carries one) and the submit row. In the RJSF branch this renders inside
  // <Form>, so the button stays type="submit" and fires the form's onSubmit
  // (Ajv-validated formData). In the yaml branch there is no <Form> to
  // submit, so the button is type="button" and flushes the cart directly
  // from the latest-ref mirrors.
  const editorBody = (
    <div className="fm-form-children">
      {!bodyless && (
        <Box mt="4">
          <Text size="2" weight="bold" as="div" mb="1">
            Prose body
          </Text>
          <Box
            style={{
              // Full-height prose editing: take the viewport minus the
              // chrome above/below (banner, collapsed frontmatter header,
              // submit row). Floor keeps it usable on short windows.
              height: "max(360px, calc(100vh - 240px))",
              border: "1px solid var(--gray-5)",
              borderRadius: 6,
            }}
          >
            {shouldUseWysiwyg(path) ? (
              <Flex gap="2" height="100%">
                {renderRelationsPanel(scrollRichHeading, null)}
                <Box flexGrow="1" minWidth="0" style={{ overflow: "auto" }}>
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
                        scheduleFlush(formData, t, fmTextRef.current);
                      }}
                      filename={path.split("/").pop()}
                      componentSlug={componentSlugFromPath(path)}
                      octokit={octokit}
                    />
                  </Suspense>
                </Box>
              </Flex>
            ) : (
              <Flex gap="2" height="100%">
                {renderRelationsPanel(cmNavigate, activeAnchor)}
                <Box flexGrow="1" minWidth="0" style={{ overflow: "auto" }}>
                  <CodeMirrorEditor
                    key={path}
                    initialText={body}
                    onChange={(t) => {
                      setBody(t);
                      scheduleFlush(formDataRef.current, t, fmTextRef.current);
                    }}
                    onReady={setCmView}
                    onCursorLineChange={handleCursorLineChange}
                  />
                </Box>
              </Flex>
            )}
          </Box>
        </Box>
      )}
      <Flex gap="2" mt="3">
        <Button
          type={surface === "yaml" ? "button" : "submit"}
          onClick={
            surface === "yaml"
              ? () =>
                  flushToCart(
                    formDataRef.current,
                    bodyRef.current,
                    fmTextRef.current,
                  )
              : undefined
          }
        >
          Add to batch
        </Button>
      </Flex>
    </div>
  );

  return (
    <Box>
      <TierBanner path={path} />
      {/* Frontmatter starts collapsed on body-carrying files so the prose
          editor gets the viewport; bodyless record files (pure forms) start
          expanded, since the form IS their content. */}
      <Flex align="center" justify="between" mb="2">
        <Text size="2" weight="bold">
          Frontmatter
        </Text>
        <Button
          type="button"
          size="1"
          variant="ghost"
          aria-label="Toggle frontmatter"
          onClick={() => setFmCollapsed((c) => !c)}
        >
          {fmCollapsed ? "Show" : "Hide"}
        </Button>
      </Flex>
      {surface === "yaml" ? (
        <Box>
          {/* Orientation caption: the schema's own root `description`, plus
              a hint that hovering a key explains it (schemaHover.ts). Comes
              straight from the schema already in hand for this file — never
              a hardcoded per-domain string — so it stays true if a schema's
              description changes. One line by design: this is orientation
              for an author who's never seen the file type, not a manual. */}
          {typeof state.schema.description === "string" && (
            <Text
              size="1"
              color="gray"
              as="p"
              mb="2"
              title={state.schema.description}
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {state.schema.description} · Hover a key to see its documentation.
            </Text>
          )}
          <Box
            // fm-yaml-pane pairs with the .fm-collapsed rule in base.css
            // (`.fm-yaml-pane.fm-collapsed { display: none; }`) — the RJSF
            // branch below relies on a form.fm-form.fm-collapsed selector,
            // which never matches this plain Box, so the pane needs its own
            // class to make the same toggle actually hide it.
            className={"fm-yaml-pane" + (fmCollapsed ? " fm-collapsed" : "")}
            style={{
              border: "1px solid var(--gray-5)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <YamlFrontmatterEditor
              key={path}
              initialText={fmText}
              schema={state.schema}
              onChange={(t) => {
                setFmText(t);
                // `t` is the pane's own new text — the correct snapshot to
                // arm the debounce with, taken at the moment it changed.
                scheduleFlush(formDataRef.current, bodyRef.current, t);
              }}
            />
          </Box>
          {editorBody}
        </Box>
      ) : (
        <RJSFForm
          className={"rjsf fm-form" + (fmCollapsed ? " fm-collapsed" : "")}
          schema={state.schema}
          uiSchema={uiSchema}
          formData={formData}
          widgets={WIDGETS}
          templates={frontmatterTemplates}
          onChange={(next) => {
            setFormData(next);
            scheduleFlush(next, bodyRef.current, fmTextRef.current);
          }}
          onSubmit={(next) =>
            flushToCart(next, bodyRef.current, fmTextRef.current)
          }
          submitLabel="Add to batch"
        >
          {editorBody}
        </RJSFForm>
      )}
    </Box>
  );
}
