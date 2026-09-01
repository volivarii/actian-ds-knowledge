// Live markdown preview pane.
//
// Uses react-markdown + remark-gfm (tables, task lists) + rehype-slug
// (auto-id headings from text). Typography lives in base.css under
// .md-prose — keep classnames in sync.
//
// Frontmatter: if the document starts with a `---` YAML block, we parse
// it and render a small key/value table above the body (mimics GitHub's
// rendering). The YAML block is then stripped from the markdown passed
// to react-markdown so it doesn't render as raw text.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { splitFrontmatter } from "../substrate/splitFrontmatter";
import { relationTypeColor, relationTypeLabel } from "../lib/relationTypes";
import { resolveReference } from "../lib/resolveReference";

// Inline links that resolve to a substrate node render as a typed reference: a
// color dot by node kind plus a tooltip naming the type, with the author's link
// text preserved. Unresolved hrefs (external URLs, paths, in-doc anchors,
// unknown slugs) fall through to a plain link, honestly undressed. data-ref /
// data-node-type expose the relation for the cross-surface highlight a later
// slice wires up.
function MdLink(
  props: React.ComponentPropsWithoutRef<"a"> & { node?: unknown },
) {
  const { href, children } = props;
  const ref = href ? resolveReference(href) : null;
  // The preview renders inside the editor, and the hash is load-bearing now.
  // An in-document anchor (`#radio-button`, which rehype-slug generates ids for
  // and which content/src/patterns/forms.md already uses) would set the hash
  // and navigate the whole app to the home screen, unmounting the file being
  // edited. A bare slug href is worse: it is a relative path, so the click
  // leaves the SPA for a Pages 404 and takes unflushed draft state with it.
  // Neither is a navigation the author asked for, so neither happens.
  const swallow = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) return;
    e.preventDefault();
    // An in-document anchor is a table of contents link, and scrolling to the
    // heading is the whole point of it. Doing it here rather than letting the
    // browser do it keeps the address out of it.
    if (href.startsWith("#")) {
      const id = decodeURIComponent(href.slice(1));
      if (id) e.currentTarget.ownerDocument.getElementById(id)?.scrollIntoView();
    }
  };
  if (!ref) {
    return (
      <a href={href} onClick={swallow}>
        {children}
      </a>
    );
  }
  return (
    <a
      href={href}
      onClick={swallow}
      className="md-ref"
      data-ref={ref.slug}
      data-node-type={ref.type}
      title={relationTypeLabel(ref.type)}
    >
      <span
        className="md-ref-dot"
        aria-hidden
        style={{
          display: "inline-block",
          width: 7,
          height: 7,
          borderRadius: 999,
          background: relationTypeColor(ref.type),
          marginRight: 4,
        }}
      />
      {children}
    </a>
  );
}

export interface PreviewProps {
  text: string;
}

function renderFrontmatterValue(value: unknown): React.ReactNode {
  if (value == null) return <span className="md-frontmatter-empty">—</span>;
  if (Array.isArray(value)) {
    return (
      <span className="md-frontmatter-chips">
        {value.map((v, i) => (
          <span key={i} className="md-frontmatter-chip">
            {String(v)}
          </span>
        ))}
      </span>
    );
  }
  if (typeof value === "object") {
    // Object values get JSON-stringified — rare in practice for
    // knowledge docs, but defensive.
    return <code>{JSON.stringify(value)}</code>;
  }
  return String(value);
}

function FrontmatterTable({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return null;
  return (
    <table className="md-frontmatter-table">
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key}>
            <th scope="row">{key}</th>
            <td>{renderFrontmatterValue(value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Preview({ text }: PreviewProps) {
  const { data, body } = splitFrontmatter(text);
  return (
    <div className="md-prose">
      {data && <FrontmatterTable data={data} />}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={{ a: MdLink }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
