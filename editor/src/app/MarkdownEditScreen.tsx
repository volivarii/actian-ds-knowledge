// Integration layer for plain-markdown editing.
//
// Loads the remote file, restores any localStorage draft (with prompt),
// mounts CM6 + Toolbar + Preview, persists edits via useDraft, and
// submits via submitDraft with the anchor-preservation guard active.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Octokit } from "@octokit/rest";
import type { EditorView } from "@codemirror/view";
import {
  AlertDialog,
  Box,
  Button,
  Callout,
  Flex,
  Heading,
  Link,
  Spinner,
  Text,
} from "@radix-ui/themes";
import { createOctokit, MissingPATError } from "../core/octokit";
import { decodeBase64Utf8 } from "./githubApi";
import { submitDraft } from "../core/submitDraft";
import { AnchorPreservationError } from "../core/anchorPreservation";
import { ReadonlyPathError, SchemaValidationError } from "../core/types";
import { CodeMirrorEditor } from "../markdown-engine/CodeMirrorEditor";
import { Toolbar } from "../markdown-engine/Toolbar";
import { Preview } from "../markdown-engine/Preview";
import { draftStoreSingleton } from "../drafts/store-instance";
import { useDraft } from "../drafts/useDraft";

interface MarkdownEditScreenProps {
  path: string;
  octokit?: Octokit;
  onOpenSettings?: () => void;
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; remoteText: string; remoteSha: string }
  | { kind: "error"; message: string };

export function MarkdownEditScreen({
  path,
  octokit,
  onOpenSettings,
}: MarkdownEditScreenProps) {
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

  const [load, setLoad] = useState<LoadState>({ kind: "idle" });
  const [view, setView] = useState<EditorView | null>(null);
  const [text, setText] = useState<string>("");
  const [restorePromptOpen, setRestorePromptOpen] = useState(false);
  const [conflictPromptOpen, setConflictPromptOpen] = useState(false);
  const [anchorWarning, setAnchorWarning] = useState<string[] | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!gh) return;
    setLoad({ kind: "loading" });
    (async () => {
      try {
        const res = await gh.repos.getContent({
          owner: "volivarii",
          repo: "actian-ds-knowledge",
          path,
          ref: "main",
        });
        if (
          Array.isArray(res.data) ||
          !("content" in res.data) ||
          res.data.encoding !== "base64"
        ) {
          throw new Error(`unexpected response for ${path}`);
        }
        const remoteText = decodeBase64Utf8(res.data.content);
        const remoteSha = res.data.sha;
        setLoad({ kind: "ready", remoteText, remoteSha });
        const draft = draftStoreSingleton.load(path);
        if (draft) {
          if (draft.basedOnSha === remoteSha) {
            setRestorePromptOpen(true);
          } else {
            setConflictPromptOpen(true);
          }
          setText(remoteText);
        } else {
          setText(remoteText);
        }
      } catch (err) {
        setLoad({ kind: "error", message: (err as Error).message });
      }
    })();
  }, [gh, path]);

  const sha = load.kind === "ready" ? load.remoteSha : "";
  const { saveText, clearDraft } = useDraft(path, sha, draftStoreSingleton);

  const handleChange = useCallback(
    (next: string) => {
      setText(next);
      if (sha) saveText(next);
    },
    [sha, saveText],
  );

  const onRestore = () => {
    const draft = draftStoreSingleton.load(path);
    if (draft && view) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: draft.text },
      });
    }
    setRestorePromptOpen(false);
  };
  const onDiscardDraft = () => {
    draftStoreSingleton.clear(path);
    setRestorePromptOpen(false);
  };
  const onConflictDiscard = () => {
    draftStoreSingleton.clear(path);
    setConflictPromptOpen(false);
  };

  const submittingRef = useRef(false);
  const doSubmit = useCallback(
    async (allowAnchorDrop: boolean) => {
      if (!gh || load.kind !== "ready") return;
      // Synchronous re-entry guard. React state (`submitting`) updates
      // asynchronously, so a double-click within the same tick can fire
      // submit twice before the button visually disables.
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      setSubmitError(null);
      try {
        const result = await submitDraft(
          {
            id: `md-${Date.now()}`,
            message: `edit ${path}`,
            files: [{ path, content: text }],
            sourceMetadata: { kind: "human", via: "MarkdownEditScreen" },
            allowAnchorDrop,
          },
          {
            owner: "volivarii",
            repo: "actian-ds-knowledge",
            base: "main",
            schemas: {},
            octokit: gh,
          },
        );
        setPrUrl(result.prUrl);
        clearDraft();
      } catch (err) {
        if (err instanceof AnchorPreservationError) {
          setAnchorWarning(err.dropped);
        } else if (err instanceof ReadonlyPathError) {
          setSubmitError(`This path is read-only: ${err.path}`);
        } else if (err instanceof SchemaValidationError) {
          setSubmitError(`Schema validation failed for ${err.path}`);
        } else {
          setSubmitError((err as Error).message);
        }
      } finally {
        setSubmitting(false);
        submittingRef.current = false;
      }
    },
    [gh, load, path, text, clearDraft],
  );

  const confirmAnchorDrop = () => {
    setAnchorWarning(null);
    void doSubmit(true);
  };
  const cancelAnchorDrop = () => {
    setAnchorWarning(null);
  };

  if (ghError) {
    return (
      <Callout.Root color="amber">
        <Callout.Text>
          {ghError}{" "}
          {onOpenSettings && (
            <Link href="#" onClick={onOpenSettings}>
              Open settings →
            </Link>
          )}
        </Callout.Text>
      </Callout.Root>
    );
  }
  if (load.kind === "loading" || load.kind === "idle") return <Spinner />;
  if (load.kind === "error") {
    return (
      <Callout.Root color="red">
        <Callout.Text>{load.message}</Callout.Text>
      </Callout.Root>
    );
  }

  return (
    <Flex direction="column" height="100%" gap="2">
      <Heading size="3">{path}</Heading>
      <Box>{view && <Toolbar view={view} />}</Box>
      <Flex flexGrow="1" minHeight="0" gap="2">
        <Box
          flexGrow="1"
          flexShrink="1"
          flexBasis="0"
          style={{
            border: "1px solid var(--gray-5)",
            borderRadius: 6,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          <CodeMirrorEditor
            key={path}
            initialText={text}
            onChange={handleChange}
            onReady={setView}
          />
        </Box>
        <Box
          flexGrow="1"
          flexShrink="1"
          flexBasis="0"
          style={{
            border: "1px solid var(--gray-5)",
            borderRadius: 6,
            padding: 12,
            overflow: "auto",
            minWidth: 0,
          }}
        >
          <Text size="1" color="gray">
            Preview is informational, not the production renderer.
          </Text>
          <Preview text={text} />
        </Box>
      </Flex>
      <Flex gap="2" justify="end" align="center">
        {prUrl && (
          <Text>
            PR opened:{" "}
            <Link href={prUrl} target="_blank" rel="noopener">
              {prUrl}
            </Link>
          </Text>
        )}
        {submitError && <Text color="red">{submitError}</Text>}
        <Button onClick={() => void doSubmit(false)} loading={submitting}>
          Submit
        </Button>
      </Flex>

      <AlertDialog.Root
        open={restorePromptOpen}
        onOpenChange={setRestorePromptOpen}
      >
        <AlertDialog.Content>
          <AlertDialog.Title>Unsaved changes</AlertDialog.Title>
          <AlertDialog.Description>
            You have unsaved changes on this file. Restore or discard?
          </AlertDialog.Description>
          <Flex gap="2" justify="end" mt="3">
            <AlertDialog.Action>
              <Button variant="soft" onClick={onDiscardDraft}>
                Discard
              </Button>
            </AlertDialog.Action>
            <AlertDialog.Action>
              <Button onClick={onRestore}>Restore</Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>

      <AlertDialog.Root
        open={conflictPromptOpen}
        onOpenChange={setConflictPromptOpen}
      >
        <AlertDialog.Content>
          <AlertDialog.Title>File changed on remote</AlertDialog.Title>
          <AlertDialog.Description>
            The file changed on the remote since your draft was saved. Discard
            the local draft and start fresh? (Merge is not supported in PR 2a.)
          </AlertDialog.Description>
          <Flex gap="2" justify="end" mt="3">
            <AlertDialog.Action>
              <Button onClick={onConflictDiscard}>Discard draft</Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>

      <AlertDialog.Root
        open={anchorWarning !== null}
        onOpenChange={() => cancelAnchorDrop()}
      >
        <AlertDialog.Content>
          <AlertDialog.Title>Anchors will disappear</AlertDialog.Title>
          <AlertDialog.Description>
            These cross-consumer anchor contracts will be removed by this
            change: {anchorWarning?.map((a) => `#${a}`).join(", ")}. Proceed
            anyway?
          </AlertDialog.Description>
          <Flex gap="2" justify="end" mt="3">
            <AlertDialog.Cancel>
              <Button variant="soft" onClick={cancelAnchorDrop}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button color="red" onClick={confirmAnchorDrop}>
                Drop anchors & submit
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </Flex>
  );
}
