import type { ComputedRef, InjectionKey } from "vue";

// A pane may show a repeated capability reason once while retaining field descriptions.
export const formatPaneCommonReasons: InjectionKey<ComputedRef<ReadonlySet<string>>> = Symbol(
  "format-pane-common-reasons",
);
