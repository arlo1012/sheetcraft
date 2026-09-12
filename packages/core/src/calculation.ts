/** Persisted calculation policy. Derived formula values remain outside the workbook. */
export type WorkbookCalculationSettings = {
  mode: "automatic" | "manual";
  iterative: boolean;
  maxIterations: number;
  maxChange: number;
};

export const DEFAULT_WORKBOOK_CALCULATION_SETTINGS: Readonly<WorkbookCalculationSettings> =
  Object.freeze({ mode: "automatic", iterative: false, maxIterations: 100, maxChange: 0.001 });

export function normalizeWorkbookCalculationSettings(
  value: WorkbookCalculationSettings,
): WorkbookCalculationSettings {
  if (value.mode !== "automatic" && value.mode !== "manual") {
    throw new TypeError("Calculation mode must be automatic or manual.");
  }
  if (typeof value.iterative !== "boolean") {
    throw new TypeError("Iterative calculation must be a boolean.");
  }
  if (
    !Number.isSafeInteger(value.maxIterations) ||
    value.maxIterations < 1 ||
    value.maxIterations > 10_000
  ) {
    throw new RangeError("Maximum iterations must be an integer between 1 and 10000.");
  }
  if (!Number.isFinite(value.maxChange) || value.maxChange <= 0) {
    throw new RangeError("Maximum change must be a positive finite number.");
  }
  return {
    mode: value.mode,
    iterative: value.iterative,
    maxIterations: value.maxIterations,
    maxChange: value.maxChange,
  };
}
