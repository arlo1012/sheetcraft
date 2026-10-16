import type { NumericValue } from "../../shared/numeric-field/types";

export type PictureBatchSizeGeometry = Readonly<{ width: number; height: number }>;
export type PictureBatchSizeScopes = Readonly<{
  selected: readonly (PictureBatchSizeGeometry | undefined)[];
  all: readonly (PictureBatchSizeGeometry | undefined)[];
}>;

/** Preview only: submission retains the batch planner's per-target validation. */
export function pictureBatchHeightPreview(
  width: number | undefined,
  targets: readonly (PictureBatchSizeGeometry | undefined)[],
): NumericValue {
  if (
    width === undefined ||
    !Number.isFinite(width) ||
    width < 1 ||
    width > 10000 ||
    !targets.length
  )
    return { kind: "empty" };
  const heights: number[] = [];
  for (const target of targets) {
    if (
      !target ||
      !Number.isFinite(target.width) ||
      !Number.isFinite(target.height) ||
      target.width <= 0 ||
      target.height <= 0
    )
      return { kind: "empty" };
    const height = (target.height * width) / target.width;
    if (!Number.isFinite(height)) return { kind: "empty" };
    heights.push(height);
  }
  const first = heights[0]!;
  // Ignore floating-point geometry noise, not meaningful display differences.
  return heights.every(
    (height) => Math.abs(height - first) <= 1e-9 * Math.max(1, Math.abs(height), Math.abs(first)),
  )
    ? { kind: "value", value: first }
    : { kind: "mixed" };
}
