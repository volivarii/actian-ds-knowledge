import React from "react";
import { Dialog, Flex, Text, Button, Box } from "@radix-ui/themes";
import { type StaleBaseConflict, decodeBase64 } from "../core/staleBase";
import { threeWayMerge } from "../core/threeWayMerge";

export interface ConflictResolution {
  path: string;
  content: string;
  basedOnSha: string;
}

type Choice = "overwrite" | "merge";

export function ConflictDialog(props: {
  conflicts: StaleBaseConflict[];
  mineByPath: Record<string, string>;
  octokit: {
    git: { getBlob(args: unknown): Promise<{ data: { content: string } }> };
  };
  owner: string;
  repo: string;
  onResolve(resolved: ConflictResolution[]): void;
  onCancel(): void;
}): JSX.Element {
  const { conflicts, mineByPath, octokit, owner, repo, onResolve, onCancel } =
    props;
  const [choices, setChoices] = React.useState<Record<string, Choice>>(
    Object.fromEntries(conflicts.map((c) => [c.path, "overwrite" as Choice])),
  );

  async function submit() {
    const resolved: ConflictResolution[] = [];
    for (const c of conflicts) {
      const mine = mineByPath[c.path] ?? "";
      let content = mine;
      if (choices[c.path] === "merge") {
        const baseRes = await octokit.git.getBlob({
          owner,
          repo,
          file_sha: c.basedOnSha,
        });
        const base = decodeBase64(baseRes.data.content);
        content = threeWayMerge(base, mine, c.remoteContent).text;
      }
      resolved.push({ path: c.path, content, basedOnSha: c.remoteSha });
    }
    onResolve(resolved);
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <Dialog.Content>
        <Dialog.Title>Remote changed since you started</Dialog.Title>
        <Dialog.Description>
          Someone updated these files on <code>main</code>. Choose how to
          resolve each before submitting.
        </Dialog.Description>
        <Flex direction="column" gap="3" mt="3">
          {conflicts.map((c) => (
            <Box key={c.path}>
              <Text weight="bold">{c.path}</Text>
              <Flex gap="2" mt="2">
                <Button
                  variant={choices[c.path] === "overwrite" ? "solid" : "soft"}
                  color={choices[c.path] === "overwrite" ? "blue" : "gray"}
                  aria-pressed={choices[c.path] === "overwrite"}
                  onClick={() =>
                    setChoices((s) => ({ ...s, [c.path]: "overwrite" }))
                  }
                >
                  Overwrite (force your version)
                </Button>
                <Button
                  variant={choices[c.path] === "merge" ? "solid" : "soft"}
                  color={choices[c.path] === "merge" ? "blue" : "gray"}
                  aria-pressed={choices[c.path] === "merge"}
                  onClick={() =>
                    setChoices((s) => ({ ...s, [c.path]: "merge" }))
                  }
                >
                  Reload &amp; reapply (3-way merge)
                </Button>
              </Flex>
            </Box>
          ))}
        </Flex>
        <Flex gap="3" mt="4" justify="end">
          <Button variant="soft" color="gray" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => void submit()}>Submit resolved</Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
