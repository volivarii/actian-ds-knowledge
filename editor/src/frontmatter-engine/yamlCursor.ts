// Locate the cursor inside a YAML frontmatter block: is it naming a key or
// typing a value, what has been typed so far, and which block path contains
// it. Pure string analysis, so it works on text the YAML parser would reject
// mid-keystroke, which is exactly when completion is wanted.
//
// Block style only. Inside a flow mapping (`- { name: x, type: y }`) this
// returns null: no completion beats a wrong completion, and the flow case is
// a slice-3 question.

export interface YamlCursor {
  kind: "key" | "value";
  path: string[];
  key: string | null;
  partial: string;
  from: number;
  siblings: string[];
}

const KEY_LINE = /^(\s*)(?:-\s+)?([A-Za-z_][\w-]*):/;
const KEY_POSITION = /^(\s*)([A-Za-z_][\w-]*)?$/;
const VALUE_POSITION = /^(\s*)(?:-\s+)?([A-Za-z_][\w-]*):\s(.*)$/;
const SEQ_SCALAR_POSITION = /^(\s*)-\s+([^{[\s][^:]*)?$/;

/** Indentation width of a line, counting the `- ` sequence marker as content.
 *  `  - name: status` measures 4, the column where `name` starts, not 2:
 *  that is the column its own fields (and a continuation line below it)
 *  align to, which is what makes it a sibling rather than a parent. */
function indentOf(line: string): number {
  const m = /^(\s*)(-\s+)?/.exec(line)!;
  return m[1]!.length + (m[2]?.length ?? 0);
}

export interface YamlKeyAt {
  key: string;
  path: string[];
  from: number;
  to: number;
}

/** The mapping key whose NAME text contains `offset` — the same block-path
 *  walk `yamlCursorAt` runs for a value being typed at this indentation
 *  (`parentPath` over the lines above, `indentOf` for where the key starts),
 *  run instead against a key already written on the page. Returns null when
 *  `offset` isn't over a key's name text: KEY_LINE simply doesn't match a
 *  blank line, a comment, or a flow construct, and this rejects a hit whose
 *  column falls in the value rather than the key.
 *
 *  Used by the hover-card adapter (schemaHover.ts, via keyDocumentation.ts)
 *  to resolve documentation for whatever key the pointer is over. Kept here
 *  rather than duplicated so the two "where in the block structure is this
 *  position" questions share one path walker. */
export function yamlKeyAt(text: string, offset: number): YamlKeyAt | null {
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  const lineEndIdx = text.indexOf("\n", lineStart);
  const line = text.slice(
    lineStart,
    lineEndIdx === -1 ? text.length : lineEndIdx,
  );

  const m = KEY_LINE.exec(line);
  if (!m) return null;

  const key = m[2]!;
  const indent = indentOf(line);
  const from = lineStart + indent;
  const to = from + key.length;
  if (offset < from || offset > to) return null;
  const before = text.slice(0, lineStart).split("\n").slice(0, -1);
  return { key, path: parentPath(before, indent), from, to };
}

export function yamlCursorAt(text: string, offset: number): YamlCursor | null {
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  const prefix = text.slice(lineStart, offset);
  if (prefix.trimStart().startsWith("#")) return null;
  // A flow mapping or sequence opened earlier on this line: bail out.
  // Known limitation (not fixed here, out of scope): this only scans the
  // current line's prefix, so a flow construct opened on a PREVIOUS line
  // and continued onto this one (e.g. `- { name: orphan,` then a
  // continuation line with `type: x }`) is invisible to this check and can
  // still produce a wrong cursor.
  if (/[{[]/.test(prefix)) return null;

  const before = text.slice(0, lineStart).split("\n").slice(0, -1);
  const indent = indentOf(prefix);

  const valueMatch = VALUE_POSITION.exec(prefix);
  if (valueMatch) {
    const partial = valueMatch[3]!;
    return {
      kind: "value",
      path: parentPath(before, indent),
      key: valueMatch[2]!,
      partial,
      from: offset - partial.length,
      siblings: siblingKeys(before, indent),
    };
  }

  const seqMatch = SEQ_SCALAR_POSITION.exec(prefix);
  if (seqMatch) {
    const partial = seqMatch[2] ?? "";
    const path = parentPath(before, indent);
    const key = path.length > 0 ? path[path.length - 1]! : null;
    return {
      kind: "value",
      // A scalar sequence item belongs to the key that opened the sequence,
      // so the completion path is that key's parent.
      path: path.slice(0, -1),
      key,
      partial,
      from: offset - partial.length,
      siblings: [],
    };
  }

  const keyMatch = KEY_POSITION.exec(prefix);
  if (keyMatch) {
    const partial = keyMatch[2] ?? "";
    return {
      kind: "key",
      path: parentPath(before, indent),
      key: null,
      partial,
      from: offset - partial.length,
      siblings: siblingKeys(before, indent),
    };
  }

  return null;
}

/** Keys on the enclosing lines with strictly smaller indentation, outermost
 *  first. A `- ` item's keys count at the item's own indentation, so a
 *  sequence contributes only the key that opened it. */
function parentPath(before: string[], indent: number): string[] {
  const path: string[] = [];
  let need = indent;
  for (let i = before.length - 1; i >= 0; i--) {
    const line = before[i]!;
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const m = KEY_LINE.exec(line);
    if (!m) continue;
    const lineIndent = indentOf(line);
    if (lineIndent < need) {
      path.unshift(m[2]!);
      need = lineIndent;
    }
  }
  return path;
}

/** Keys already written at this indentation since the enclosing parent, so
 *  completion can omit what the record already has. */
function siblingKeys(before: string[], indent: number): string[] {
  const keys: string[] = [];
  for (let i = before.length - 1; i >= 0; i--) {
    const line = before[i]!;
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const lineIndent = indentOf(line);
    if (lineIndent < indent) break;
    if (lineIndent > indent) continue;
    const m = KEY_LINE.exec(line);
    if (m) keys.unshift(m[2]!);
    // A `- ` marker at this indentation starts a new item: earlier keys
    // belong to the previous item, not to this one.
    if (/^\s*-\s/.test(line)) break;
  }
  return keys;
}
