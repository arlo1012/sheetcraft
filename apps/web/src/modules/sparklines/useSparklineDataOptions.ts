import type { CellSparkline } from "@sheetcraft/core/sparklines";
import {
  useSparklineSettingsDialog,
  type SparklineDialogOptions,
} from "./useSparklineSettingsDialog";

export type SparklineDataOptions = Partial<Pick<CellSparkline, "empty" | "showHidden">>;

export function useSparklineDataOptions(options: SparklineDialogOptions) {
  return useSparklineSettingsDialog<[], SparklineDataOptions, SparklineDataOptions>(
    options,
    (context) => ({
      empty: context.mixed.includes("empty") ? undefined : context.value.empty,
      showHidden: context.mixed.includes("showHidden") ? undefined : context.value.showHidden,
    }),
    (context, _initial, value) => {
      const patch: SparklineDataOptions = {
        ...(value.empty !== undefined ? { empty: value.empty } : {}),
        ...(value.showHidden !== undefined ? { showHidden: value.showHidden } : {}),
      };
      return !Object.keys(patch).length || context.apply(patch);
    },
  );
}
