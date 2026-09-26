export const COLUMN_OUTLINE_LEVEL_STEP = 20;
export const OUTLINE_CONTROL_SIZE = 16;
export const OUTLINE_CONTROL_INSET = 2;

/** Leave one extra row for the level button that expands every group. */
export function getColumnOutlineHeight(depth: number): number {
  return depth > 0 ? (depth + 1) * COLUMN_OUTLINE_LEVEL_STEP + OUTLINE_CONTROL_INSET * 2 : 0;
}
