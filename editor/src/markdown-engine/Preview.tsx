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
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
        {body}
      </ReactMarkdown>
    </div>
  );
}
