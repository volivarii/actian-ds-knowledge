import { MetaFieldTemplate } from "./MetaFieldTemplate";
import { MetaObjectFieldTemplate } from "./MetaObjectFieldTemplate";

/** Templates the _meta.yml form opts into. Scoped — other RJSF forms
 *  (app-context, fm-to-ds-map, icon-groups) are unaffected. */
export const metaFormTemplates = {
  FieldTemplate: MetaFieldTemplate,
  ObjectFieldTemplate: MetaObjectFieldTemplate,
};
