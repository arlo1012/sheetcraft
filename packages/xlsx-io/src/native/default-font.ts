import { DEFAULT_CELL_TEXT_COLOR } from "@sheetcraft/core/style";
import type { NativeStyle } from "./model.js";

/** Core's fixed default color; Calibri 11 still defines the MDW 7 width baseline. */
export function createNativeNormalFont(): NativeStyle {
  return {
    size: 11,
    color: { argb: `FF${DEFAULT_CELL_TEXT_COLOR.slice(1).toUpperCase()}` },
    name: "Calibri",
    family: 2,
  };
}
