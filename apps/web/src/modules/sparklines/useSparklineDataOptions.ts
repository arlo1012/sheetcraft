import { onScopeDispose, ref, shallowRef, watch } from "vue";
import type { CellSparkline } from "@sheetcraft/core/sparklines";
import type { SparklineToolContext } from "./useSparklineTools";

export type SparklineDataOptions = Partial<Pick<CellSparkline, "empty" | "showHidden">>;
type DataOptionsDialog = {
  key: string;
  initial: SparklineDataOptions;
  confirm: (patch: SparklineDataOptions) => void;
  close: () => void;
};

export function useSparklineDataOptions(options: {
  getContext: () => SparklineToolContext | undefined;
  flush: () => boolean;
}) {
  const dialog = shallowRef<DataOptionsDialog>();
  const failed = ref(false);
  let sequence = 0;
  function close(): void {
    dialog.value = undefined;
    failed.value = false;
  }
  watch(options.getContext, close, { flush: "sync" });
  onScopeDispose(close);
  function open(): void {
    const beforeFlush = options.getContext();
    if (!beforeFlush || beforeFlush.disabled || !options.flush()) return;
    const context = options.getContext();
    if (!context || context.disabled) return;
    const current = () => dialog.value === target && options.getContext() === context;
    const target: DataOptionsDialog = {
      key: `${context.key}:${++sequence}`,
      initial: {
        empty: context.mixed.includes("empty") ? undefined : context.value.empty,
        showHidden: context.mixed.includes("showHidden") ? undefined : context.value.showHidden,
      },
      confirm(value) {
        if (!current() || context.disabled) return;
        const patch: SparklineDataOptions = {
          ...(value.empty !== undefined ? { empty: value.empty } : {}),
          ...(value.showHidden !== undefined ? { showHidden: value.showHidden } : {}),
        };
        if (!Object.keys(patch).length) {
          close();
          return;
        }
        if (context.apply(patch)) {
          if (dialog.value === target) close();
        } else if (current()) failed.value = true;
      },
      close() {
        if (dialog.value === target) close();
      },
    };
    failed.value = false;
    dialog.value = target;
  }
  return { dialog, failed, open, close };
}
