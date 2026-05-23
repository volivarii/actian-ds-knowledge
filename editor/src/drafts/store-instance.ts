// Shared DraftStore singleton — App, EditorShell, and MarkdownEditScreen
// must all reference the SAME instance so subscribe/emit events propagate.

import { DraftStore } from "./DraftStore";

export const draftStoreSingleton = new DraftStore(
  typeof window !== "undefined"
    ? window.localStorage
    : (null as unknown as Storage),
);
