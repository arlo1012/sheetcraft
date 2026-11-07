import {
  useSparklineSettingsDialog,
  type SparklineDialogOptions,
} from "./useSparklineSettingsDialog";

export type SparklineAxisEnd = "minAxis" | "maxAxis";
export type SparklineLimitDraft = { end: SparklineAxisEnd; value?: number };

export function useSparklineAxisLimit(options: SparklineDialogOptions) {
  return useSparklineSettingsDialog<[SparklineAxisEnd], SparklineLimitDraft, number>(
    options,
    (context, end) => {
      const limit = context.value[end];
      return {
        end,
        value: !context.mixed.includes(end) && limit?.type === "custom" ? limit.value : undefined,
      };
    },
    (context, { end }, value) =>
      Number.isFinite(value) && context.apply({ [end]: { type: "custom", value } }),
  );
}
