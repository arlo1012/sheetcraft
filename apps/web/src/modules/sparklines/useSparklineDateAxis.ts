import { formatSparklineDateRange, readSparklineDateRange } from "@sheetcraft/core/sparklines";
import {
  useSparklineSettingsDialog,
  type SparklineDialogOptions,
} from "./useSparklineSettingsDialog";

export function useSparklineDateAxis(options: SparklineDialogOptions, sheetName: () => string) {
  return useSparklineSettingsDialog<[], string, string>(
    options,
    (context) =>
      !context.mixed.includes("dateRange") && context.value.dateRange
        ? "=" + formatSparklineDateRange(context.value.dateRange, sheetName())
        : "",
    (context, _initial, text) => {
      const dateRange = readSparklineDateRange(text, sheetName());
      return !!dateRange && context.apply({ dateRange });
    },
  );
}
