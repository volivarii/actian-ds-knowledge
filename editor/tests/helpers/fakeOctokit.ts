// A fetch-free Octokit double for screen tests: `repos.getContent` serves the
// given files (base64, with a blob sha, as GitHub does) and 404s the rest;
// `repos.listCommits` returns nothing. One copy for the suite to import.
export const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

export function fakeOctokit(files: Record<string, string>) {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (!(path in files)) {
          const e = new Error("not found") as Error & { status: number };
          e.status = 404;
          throw e;
        }
        return { data: { encoding: "base64", content: b64(files[path]!), sha: `sha-${path}` } };
      },
      listCommits: async () => ({ data: [] }),
    },
    git: {},
    pulls: {},
  } as any;
}
