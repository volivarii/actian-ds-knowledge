"use strict";

function extractFrontmatter(md) {
  if (md.slice(0, 4) !== "---\n") {
    throw new Error("missing frontmatter (file must start with '---\\n')");
  }
  var end = md.indexOf("\n---\n", 4);
  if (end < 0) {
    throw new Error("missing frontmatter close fence");
  }
  var fmBody = md.slice(4, end);
  var body = md.slice(end + 5).replace(/^\n+/, "");
  return { frontmatter: parseYamlSubset(fmBody), body: body };
}

// Tiny YAML subset: top-level key:value, plus one nesting level under
// `confidence:`. No arrays, no quoting. Matches the agreed schema.
function parseYamlSubset(src) {
  var out = {};
  var lines = src.split("\n");
  var i = 0;
  while (i < lines.length) {
    var line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    var m = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!m) {
      throw new Error(
        "frontmatter parse error at line " + (i + 1) + ": " + line,
      );
    }
    var key = m[1];
    var val = m[2].trim();
    if (val === "") {
      // nested block — only `confidence` supported per spec
      if (key !== "confidence") {
        throw new Error("unsupported nested block: " + key);
      }
      var nested = {};
      i++;
      while (i < lines.length && /^\s+\S/.test(lines[i])) {
        var nm = lines[i].match(/^\s+([a-zA-Z0-9_]+):\s*(\S+)$/);
        if (!nm) {
          throw new Error("nested parse error at line " + (i + 1));
        }
        nested[nm[1]] = nm[2];
        i++;
      }
      out[key] = nested;
      continue;
    }
    out[key] = val;
    i++;
  }
  return out;
}

function extractSections(body) {
  var lines = body.split("\n");
  var sections = {};
  var current = null;
  var buf = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      if (current) {
        sections[current] = buf.join("\n").trim();
      }
      current = m[1];
      buf = [];
      continue;
    }
    if (current) {
      buf.push(line);
    }
  }
  if (current) {
    sections[current] = buf.join("\n").trim();
  }
  return sections;
}

function parseBulletList(text) {
  // Matches: `- **Name** — description` or `- **Name** - description`
  var re = /^-\s+\*\*([^*]+)\*\*\s+[—-]\s+(.+)$/gm;
  var items = [];
  var m;
  while ((m = re.exec(text)) !== null) {
    items.push({ name: m[1].trim(), description: m[2].trim() });
  }
  return items;
}

module.exports = {
  extractFrontmatter: extractFrontmatter,
  extractSections: extractSections,
  parseBulletList: parseBulletList,
};
