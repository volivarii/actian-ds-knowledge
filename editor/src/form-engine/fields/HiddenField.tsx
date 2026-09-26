// A field edited elsewhere: the links a record stores are edited in its
// Connections section, so the form leaves them out. RJSF's `ui:widget:
// "hidden"` does not apply to arrays and objects, so this field renders
// nothing and leaves the value as it is.
export function HiddenField(): null {
  return null;
}
