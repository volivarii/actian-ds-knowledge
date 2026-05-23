// Live markdown preview pane.
//
// Uses react-markdown + remark-gfm (tables, task lists) + rehype-slug
// (auto-id headings from text). The author's {#anchor} markers will
// appear as literal text in headings — accepted limitation in PR 2a
// (the spec calls it out as "preview is informational, not the
// production renderer"). PR 2b extends this with a rehype plugin
// that rewrites {#slug} markers into the heading id.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";

export interface PreviewProps {
  text: string;
}

export function Preview({ text }: PreviewProps) {
  return (
    <div className="md-preview">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
