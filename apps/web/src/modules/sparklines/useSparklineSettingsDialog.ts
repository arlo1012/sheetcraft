import { onScopeDispose, ref, shallowRef, watch } from "vue";
import type { SparklineToolContext } from "./useSparklineTools";

export type SparklineDialogOptions = {
  getContext: () => SparklineToolContext | undefined;
  flush: () => boolean;
};

export function useSparklineSettingsDialog<Args extends unknown[], Initial, Input>(
  options: SparklineDialogOptions,
  initialize: (context: SparklineToolContext, ...args: Args) => Initial,
  apply: (context: SparklineToolContext, initial: Initial, value: Input) => boolean,
) {
  type Draft = {
    key: string;
    initial: Initial;
    confirm: (value: Input) => void;
    close: () => void;
  };
  const dialog = shallowRef<Draft>();
  const failed = ref(false);
  let sequence = 0;
  function close() {
    dialog.value = undefined;
    failed.value = false;
  }
  watch(options.getContext, close, { flush: "sync" });
  onScopeDispose(close);
  function open(...args: Args) {
    const before = options.getContext();
    if (!before || before.disabled || !options.flush()) return;
    const context = options.getContext();
    if (!context || context.disabled) return;
    const initial = initialize(context, ...args);
    const draft: Draft = {
      key: `${context.key}:${++sequence}`,
      initial,
      confirm(value) {
        if (dialog.value !== draft || options.getContext() !== context || context.disabled) return;
        const accepted = apply(context, initial, value);
        if (dialog.value !== draft) return;
        if (accepted) close();
        else failed.value = true;
      },
      close() {
        if (dialog.value === draft) close();
      },
    };
    failed.value = false;
    dialog.value = draft;
  }
  return { dialog, failed, open, close };
}
