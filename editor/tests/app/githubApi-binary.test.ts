import { test } from "node:test";
import assert from "node:assert/strict";
import { getBinaryFileAsDataUrl } from "../../src/app/githubApi";

function fakeGh(content: string, encoding = "base64") {
  return {
    repos: {
      getContent: async () => ({ data: { content, encoding } }),
    },
  } as any;
}

test("getBinaryFileAsDataUrl: builds a data URL and strips newlines", async () => {
  const b64 = Buffer.from("hello").toString("base64");
  const wrapped = `${b64}\n`;
  const url = await getBinaryFileAsDataUrl(fakeGh(wrapped), "x/y.webp");
  assert.equal(url, `data:image/webp;base64,${b64}`);
});

test("getBinaryFileAsDataUrl: honours a custom mime", async () => {
  const b64 = Buffer.from("hi").toString("base64");
  const url = await getBinaryFileAsDataUrl(fakeGh(b64), "x/y.png", "image/png");
  assert.equal(url, `data:image/png;base64,${b64}`);
});

test("getBinaryFileAsDataUrl: throws on a directory listing", async () => {
  const gh = { repos: { getContent: async () => ({ data: [] }) } } as any;
  await assert.rejects(() => getBinaryFileAsDataUrl(gh, "x/dir"));
});

test("getBinaryFileAsDataUrl: throws on non-base64 encoding", async () => {
  await assert.rejects(() =>
    getBinaryFileAsDataUrl(fakeGh("zzz", "utf-8"), "x/y.webp"),
  );
});
