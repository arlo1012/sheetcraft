import type { ComputedRef, InjectionKey } from "vue";

// A pane may show a repeated capability reason once while retaining field descriptions.
export const pictureFormatCommonReasons: InjectionKey<ComputedRef<ReadonlySet<string>>> = Symbol(
  "picture-format-common-reasons",
);
