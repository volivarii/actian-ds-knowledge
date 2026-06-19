import { MetaFieldTemplate } from "./MetaFieldTemplate";
import { MetaObjectFieldTemplate } from "./MetaObjectFieldTemplate";
import { FrontmatterObjectFieldTemplate } from "./FrontmatterObjectFieldTemplate";

/** Templates the _meta.yml form opts into. Scoped — other RJSF forms
 *  (app-context, icon-groups) are unaffected. */
export const metaFormTemplates = {
  FieldTemplate: MetaFieldTemplate,
  ObjectFieldTemplate: MetaObjectFieldTemplate,
};

/** Templates the frontmatter-body editor opts into. The root
 *  ObjectFieldTemplate groups `ui:options.syncedFields` into a collapsed,
 *  read-only disclosure (e.g. a category's Figma-sourced anatomy/variants). */
export const frontmatterTemplates = {
  ObjectFieldTemplate: FrontmatterObjectFieldTemplate,
};
