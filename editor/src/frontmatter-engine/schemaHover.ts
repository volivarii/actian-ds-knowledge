// CM6 adapter: key documentation (keyDocumentation) -> hover tooltip.
// Mirrors schemaCompletion.ts's shape: the pure resolution lives in
// keyDocumentation.ts (no CodeMirror import); this file only turns a
// KeyDocumentation into a CM6 Tooltip and its DOM.

import { hoverTooltip, type Tooltip } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { keyDocumentationAt, type KeyDocumentation } from "./keyDocumentation";
import type { JsonSchema } from "./schemaWalk";

/** An example value rendered readably: a string example stands on its own,
 *  anything else (the `sidebar` example is an array of objects) is shown as
 *  its JSON text rather than `[object Object]`. */
function exampleText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function renderHoverCard(doc: KeyDocumentation): HTMLElement {
  const card = document.createElement("div");
  card.className = "cm-schema-hover";

  const title = document.createElement("div");
  title.className = "cm-schema-hover-title";

  const keyEl = document.createElement("code");
  keyEl.className = "cm-schema-hover-key";
  keyEl.textContent = doc.key;
  title.appendChild(keyEl);

  if (doc.type) {
    const typeEl = document.createElement("span");
    typeEl.className = "cm-schema-hover-type";
    typeEl.textContent = doc.type;
    title.appendChild(typeEl);
  }

  if (doc.required) {
    const requiredEl = document.createElement("span");
    requiredEl.className = "cm-schema-hover-required";
    requiredEl.textContent = "required";
    title.appendChild(requiredEl);
  }

  card.appendChild(title);

  if (doc.description) {
    const description = document.createElement("div");
    description.className = "cm-schema-hover-description";
    description.textContent = doc.description;
    card.appendChild(description);
  }

  if (doc.examples && doc.examples.length > 0) {
    const label = document.createElement("div");
    label.className = "cm-schema-hover-examples-label";
    label.textContent = "Examples";
    card.appendChild(label);

    const list = document.createElement("ul");
    list.className = "cm-schema-hover-examples";
    for (const example of doc.examples) {
      const item = document.createElement("li");
      item.textContent = exampleText(example);
      list.appendChild(item);
    }
    card.appendChild(list);
  }

  return card;
}

/** CM6 extension factory. Register in the pane's extension array alongside
 *  schemaCompletionExtension and the linter. */
export function schemaHoverExtension(schema: JsonSchema): Extension {
  return hoverTooltip((view, pos): Tooltip | null => {
    const doc = keyDocumentationAt(view.state.doc.toString(), pos, schema);
    if (!doc) return null;
    return {
      pos: doc.from,
      end: doc.to,
      create: () => ({ dom: renderHoverCard(doc) }),
    };
  });
}
