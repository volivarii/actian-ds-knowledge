// CJS bridge for @rjsf/utils.
// @rjsf/utils ships as CommonJS (dist/index.js) with no `exports` field, so
// Node's ESM runtime cannot resolve named exports via static analysis. We
// import the whole module namespace and extract helpers at runtime, falling
// back to the `.default` sub-object that some bundlers wrap CJS modules in.
// This mirrors the pattern already used in RJSFForm.tsx.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import * as rjsfUtilsMod from "@rjsf/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = rjsfUtilsMod as any;

export const getUiOptions: (
  uiSchema?: Record<string, unknown>,
  globalOptions?: Record<string, unknown>
) => Record<string, unknown> =
  typeof _mod?.getUiOptions === "function"
    ? _mod.getUiOptions
    : typeof _mod?.default?.getUiOptions === "function"
      ? _mod.default.getUiOptions
      : () => ({});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getTemplate: (name: string, registry: any, uiOptions?: Record<string, unknown>) => any =
  typeof _mod?.getTemplate === "function"
    ? _mod.getTemplate
    : typeof _mod?.default?.getTemplate === "function"
      ? _mod.default.getTemplate
      : (name: string, registry: any) => registry?.templates?.[name];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getInputProps: (...args: any[]) => any =
  typeof _mod?.getInputProps === "function"
    ? _mod.getInputProps
    : typeof _mod?.default?.getInputProps === "function"
      ? _mod.default.getInputProps
      : _mod?.getInputProps ?? _mod?.default?.getInputProps;
