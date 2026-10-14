import type { EquationDocument } from "@sheetcraft/core/equation-document";

// A validated Core equation contains plain mathematical data, never Vue refs.
// Keep its exact recursive union rather than deeply remapping it in workbook refs.
declare module "@vue/reactivity" {
  interface RefUnwrapBailTypes {
    equationDocument: EquationDocument;
  }
}
